import "server-only";

import { z } from "zod";

import {
  BUG_REPORT_EMPTY_REPLY,
  BUG_REPORT_FAILED_REPLY,
  type BugReportIssue,
  buildBugReportIssue,
  extractMentionedText,
  formatIssueCreatedReply,
  formatUserIdReply,
  isUserIdRequest,
  LINE_MESSAGE_ID_PATTERN,
  LINE_USER_ID_PATTERN,
} from "../domain/bug-report";

export type CreatedIssue = Readonly<{ number: number; url: string }>;

/** 起票フローが依存する外部境界。DBとGitHubの実装は差し替え可能にし、単体テストで検証する */
export type LineBugReportGateway = Readonly<{
  fetchLinkedLineGroupId: (groupId: string) => Promise<string | null>;
  claimReport: (
    groupId: string,
    messageId: string,
    receivedAt: Date,
  ) => Promise<boolean>;
  completeReport: (messageId: string, issueNumber: number) => Promise<void>;
  releaseReport: (messageId: string) => Promise<void>;
  createIssue: (issue: BugReportIssue) => Promise<CreatedIssue>;
}>;

/** Reply APIによる返信境界 */
export type LineReplyGateway = Readonly<{
  replyText: (replyToken: string, text: string) => Promise<void>;
}>;

export type BugReportSettings = Readonly<{
  /** 連携先を照合する家計グループID */
  groupId: string;
  /** 起票を許可するLINE userId */
  allowedUserIds: ReadonlySet<string>;
}>;

/** 起票用の設定と境界。環境変数が揃わないときはnullで、メンションを処理しない (LBR-010) */
export type BugReportContext = Readonly<{
  settings: BugReportSettings;
  gateway: LineBugReportGateway;
}>;

/** 処理結果。監査ログ用に件数だけを持ち、userId・本文・groupIdを含めない (LBR-003) */
export type LineMessageOutcome = Readonly<{
  created: number;
  failed: number;
  unauthorized: number;
}>;

const LINE_GROUP_ID_PATTERN = /^[0-9A-Za-z_-]{1,64}$/;

const bodySchema = z.object({ events: z.array(z.unknown()).max(100) });

const messageEventSchema = z.object({
  type: z.literal("message"),
  mode: z.string().optional(),
  timestamp: z.number().int().nonnegative().optional(),
  replyToken: z.string().min(1).optional(),
  source: z
    .object({
      type: z.string(),
      groupId: z.string().optional(),
      userId: z.string().optional(),
    })
    .optional(),
  message: z.object({
    id: z.string(),
    type: z.string(),
    text: z.string().optional(),
    mention: z
      .object({
        mentionees: z.array(
          z.object({
            index: z.number().int(),
            length: z.number().int(),
            isSelf: z.boolean().optional(),
          }),
        ),
      })
      .optional(),
  }),
});

type MessageEvent = z.infer<typeof messageEventSchema>;

// 返信の失敗はWebhookのエラーにしない (LBR-008)
async function replySafely(
  reply: LineReplyGateway,
  replyToken: string,
  text: string,
): Promise<void> {
  try {
    await reply.replyText(replyToken, text);
  } catch {
    // 返信失敗は無視する（tokenの期限切れ等）
  }
}

type Counter = { created: number; failed: number; unauthorized: number };

// 連携済みグループの許可された報告者からのメンションを1件起票する (LBR-002〜LBR-008)
async function fileBugReport(
  event: MessageEvent,
  text: string,
  replyToken: string,
  reply: LineReplyGateway,
  context: BugReportContext,
  counter: Counter,
): Promise<void> {
  const source = event.source;
  // 許可リスト照合は DB を読む前に行い、許可外は起票も返信もしない (LBR-003)
  if (!source?.userId || !context.settings.allowedUserIds.has(source.userId)) {
    counter.unauthorized += 1;
    return;
  }
  if (!source.groupId || !LINE_GROUP_ID_PATTERN.test(source.groupId)) return;
  if (!LINE_MESSAGE_ID_PATTERN.test(event.message.id)) return;

  const receivedAt = new Date(event.timestamp ?? Date.now());
  let claimed = false;
  try {
    const linkedLineGroupId = await context.gateway.fetchLinkedLineGroupId(
      context.settings.groupId,
    );
    if (linkedLineGroupId !== source.groupId) return;

    if (text === "") {
      await replySafely(reply, replyToken, BUG_REPORT_EMPTY_REPLY);
      return;
    }

    // 起票記録の確保をGitHub呼び出しより先に行い、再送・多重起動で二重起票しない (LBR-007)
    claimed = await context.gateway.claimReport(
      context.settings.groupId,
      event.message.id,
      receivedAt,
    );
    if (!claimed) return;

    const issue = await context.gateway.createIssue(
      buildBugReportIssue(text, { messageId: event.message.id, receivedAt }),
    );
    await context.gateway.completeReport(event.message.id, issue.number);
    counter.created += 1;
    await replySafely(
      reply,
      replyToken,
      formatIssueCreatedReply(issue.number, issue.url),
    );
  } catch {
    counter.failed += 1;
    if (claimed) {
      try {
        await context.gateway.releaseReport(event.message.id);
      } catch {
        // 返上に失敗した記録は未完了のまま残る。再起票は新しいメンションで行う
      }
    }
    await replySafely(reply, replyToken, BUG_REPORT_FAILED_REPLY);
  }
}

// 署名検証済みのLINE Webhook本文からmessage eventを処理する (LBR-001, LBR-009, LBR-011)。
// 1対1トークの「ID」には送信者自身のuserIdを返信し、グループでのbotメンションは起票フローへ渡す。
// 例外を外へ投げず、Webhook自体は常に成功応答できるようにする
export async function handleLineMessages(
  rawBody: string,
  reply: LineReplyGateway,
  bugReport: BugReportContext | null,
): Promise<LineMessageOutcome> {
  const counter: Counter = { created: 0, failed: 0, unauthorized: 0 };

  let events: readonly unknown[];
  try {
    events = bodySchema.parse(JSON.parse(rawBody)).events;
  } catch {
    return counter;
  }

  for (const candidate of events) {
    const parsed = messageEventSchema.safeParse(candidate);
    if (!parsed.success) continue;
    const event = parsed.data;
    const text = event.message.text;
    if (
      event.mode !== "active" ||
      event.message.type !== "text" ||
      typeof text !== "string" ||
      !event.replyToken
    ) {
      continue;
    }

    if (event.source?.type === "user") {
      const userId = event.source.userId;
      if (
        isUserIdRequest(text) &&
        userId &&
        LINE_USER_ID_PATTERN.test(userId)
      ) {
        await replySafely(reply, event.replyToken, formatUserIdReply(userId));
      }
      continue;
    }

    if (event.source?.type !== "group" || !bugReport) continue;

    const mentioned = extractMentionedText({
      text,
      mentionees: (event.message.mention?.mentionees ?? []).map(
        (mentionee) => ({
          index: mentionee.index,
          length: mentionee.length,
          isSelf: mentionee.isSelf === true,
        }),
      ),
    });
    if (mentioned === null) continue;

    await fileBugReport(
      event,
      mentioned,
      event.replyToken,
      reply,
      bugReport,
      counter,
    );
  }

  return counter;
}
