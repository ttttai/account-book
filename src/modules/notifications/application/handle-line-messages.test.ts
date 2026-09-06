import { describe, expect, it, type Mock, vi } from "vitest";

import {
  type BugReportContext,
  handleLineMessages,
  type LineBugReportGateway,
  type LineReplyGateway,
} from "./handle-line-messages";

type MockGateway = {
  [K in keyof LineBugReportGateway]: Mock<LineBugReportGateway[K]>;
};

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const LINE_GROUP_ID = "Cffffeeeeddddccccbbbbaaaa99998888";
const OTHER_LINE_GROUP_ID = "C0000000000000000000000000000000";
const ALLOWED_USER_ID = "U0123456789abcdef0123456789abcdef";
const OTHER_USER_ID = "Uffffffffffffffffffffffffffffffff";
const MESSAGE_ID = "468789577898262530";
const REPLY_TOKEN = "nHuyWiB7yP5Zw52FIkcQobQuGDXCTA";
const ISSUE_URL = "https://github.com/ttttai/account-book/issues/123";
const TIMESTAMP = Date.UTC(2026, 8, 7, 12, 34, 56);

type EventOverrides = {
  source?: Record<string, unknown>;
  message?: Record<string, unknown>;
  mode?: string;
  replyToken?: string | null;
};

function mentionEvent(overrides: EventOverrides = {}) {
  const { replyToken = REPLY_TOKEN, ...rest } = overrides;
  return {
    type: "message",
    mode: "active",
    timestamp: TIMESTAMP,
    ...(replyToken === null ? {} : { replyToken }),
    source: {
      type: "group",
      groupId: LINE_GROUP_ID,
      userId: ALLOWED_USER_ID,
      ...rest.source,
    },
    message: {
      id: MESSAGE_ID,
      type: "text",
      text: "@わが家bot 支出を保存すると画面が固まる",
      mention: {
        mentionees: [{ index: 0, length: 7, type: "user", isSelf: true }],
      },
      ...rest.message,
    },
    ...(rest.mode ? { mode: rest.mode } : {}),
  };
}

function body(...events: unknown[]): string {
  return JSON.stringify({ destination: "Uxxxx", events });
}

function createGateway(overrides: Partial<MockGateway> = {}): MockGateway {
  return {
    fetchLinkedLineGroupId: vi.fn<
      LineBugReportGateway["fetchLinkedLineGroupId"]
    >(async () => LINE_GROUP_ID),
    claimReport: vi.fn<LineBugReportGateway["claimReport"]>(async () => true),
    completeReport: vi.fn<LineBugReportGateway["completeReport"]>(
      async () => undefined,
    ),
    releaseReport: vi.fn<LineBugReportGateway["releaseReport"]>(
      async () => undefined,
    ),
    createIssue: vi.fn<LineBugReportGateway["createIssue"]>(async () => ({
      number: 123,
      url: ISSUE_URL,
    })),
    ...overrides,
  };
}

function createReply(): { replyText: Mock<LineReplyGateway["replyText"]> } {
  return {
    replyText: vi.fn<LineReplyGateway["replyText"]>(async () => undefined),
  };
}

function context(gateway: LineBugReportGateway): BugReportContext {
  return {
    settings: { groupId: GROUP_ID, allowedUserIds: new Set([ALLOWED_USER_ID]) },
    gateway,
  };
}

describe("handleLineMessages", () => {
  it("許可された報告者のメンションから起票し、記録を完了してURLを返信する (AC-LBR-008-1)", async () => {
    const gateway = createGateway();
    const reply = createReply();

    const outcome = await handleLineMessages(
      body(mentionEvent()),
      reply,
      context(gateway),
    );

    expect(outcome).toEqual({ created: 1, failed: 0, unauthorized: 0 });
    expect(gateway.fetchLinkedLineGroupId).toHaveBeenCalledWith(GROUP_ID);
    expect(gateway.claimReport).toHaveBeenCalledWith(
      GROUP_ID,
      MESSAGE_ID,
      new Date(TIMESTAMP),
    );
    expect(gateway.createIssue).toHaveBeenCalledTimes(1);
    const issue = gateway.createIssue.mock.calls[0]?.[0];
    expect(issue?.title).toBe("bug(line): 支出を保存すると画面が固まる");
    expect(issue?.labels).toEqual(["bug", "source:line"]);
    // Issue本文に報告者・グループの識別子を含めない (AC-LBR-004-1)
    expect(issue?.body).not.toContain(ALLOWED_USER_ID);
    expect(issue?.body).not.toContain(LINE_GROUP_ID);
    expect(issue?.body).not.toContain("@わが家bot");
    expect(gateway.completeReport).toHaveBeenCalledWith(MESSAGE_ID, 123);
    expect(gateway.releaseReport).not.toHaveBeenCalled();
    expect(reply.replyText).toHaveBeenCalledWith(
      REPLY_TOKEN,
      `不具合Issueを作成しました。\n#123 ${ISSUE_URL}`,
    );
    // 起票記録の確保はGitHub呼び出しより先 (LBR-007)
    expect(gateway.claimReport.mock.invocationCallOrder[0]).toBeLessThan(
      gateway.createIssue.mock.invocationCallOrder[0] ?? 0,
    );
  });

  it("許可外の報告者は起票も返信もせず、件数だけを結果に含める (AC-LBR-003-1)", async () => {
    const gateway = createGateway();
    const reply = createReply();

    const outcome = await handleLineMessages(
      body(mentionEvent({ source: { userId: OTHER_USER_ID } })),
      reply,
      context(gateway),
    );

    expect(outcome).toEqual({ created: 0, failed: 0, unauthorized: 1 });
    expect(JSON.stringify(outcome)).not.toContain(OTHER_USER_ID);
    expect(gateway.fetchLinkedLineGroupId).not.toHaveBeenCalled();
    expect(gateway.claimReport).not.toHaveBeenCalled();
    expect(gateway.createIssue).not.toHaveBeenCalled();
    expect(reply.replyText).not.toHaveBeenCalled();
  });

  it("メンションなし・@Allのみ・非text・standby modeは処理しない (AC-LBR-001-1)", async () => {
    const gateway = createGateway();
    const reply = createReply();

    const outcome = await handleLineMessages(
      body(
        mentionEvent({ message: { text: "雑談です", mention: undefined } }),
        mentionEvent({
          message: {
            text: "@All 今日は外食",
            mention: {
              mentionees: [{ index: 0, length: 4, type: "all" }],
            },
          },
        }),
        mentionEvent({
          message: { type: "sticker", text: undefined, mention: undefined },
        }),
        mentionEvent({ mode: "standby" }),
        { type: "join", source: { type: "group", groupId: LINE_GROUP_ID } },
      ),
      reply,
      context(gateway),
    );

    expect(outcome).toEqual({ created: 0, failed: 0, unauthorized: 0 });
    expect(gateway.claimReport).not.toHaveBeenCalled();
    expect(reply.replyText).not.toHaveBeenCalled();
  });

  it("1対1トーク・複数人トーク・未連携グループのメンションは起票しない (AC-LBR-002-1)", async () => {
    const gateway = createGateway();
    const reply = createReply();

    const outcome = await handleLineMessages(
      body(
        mentionEvent({
          source: { type: "user", groupId: undefined, userId: ALLOWED_USER_ID },
        }),
        mentionEvent({ source: { type: "room", roomId: "R1" } }),
        mentionEvent({ source: { groupId: OTHER_LINE_GROUP_ID } }),
      ),
      reply,
      context(gateway),
    );

    expect(outcome).toEqual({ created: 0, failed: 0, unauthorized: 0 });
    expect(gateway.claimReport).not.toHaveBeenCalled();
    expect(gateway.createIssue).not.toHaveBeenCalled();
    expect(reply.replyText).not.toHaveBeenCalled();
  });

  it("本文が空のときは起票せず案内を返信する (AC-LBR-001-2)", async () => {
    const gateway = createGateway();
    const reply = createReply();

    await handleLineMessages(
      body(mentionEvent({ message: { text: "@わが家bot " } })),
      reply,
      context(gateway),
    );

    expect(gateway.claimReport).not.toHaveBeenCalled();
    expect(reply.replyText).toHaveBeenCalledWith(
      REPLY_TOKEN,
      "報告内容が空です。メンションの後に不具合の内容を書いてください。",
    );
  });

  it("同じmessage.idの2回目は記録を確保できずGitHubを呼ばない (AC-LBR-007-1)", async () => {
    const gateway = createGateway({
      claimReport: vi.fn<LineBugReportGateway["claimReport"]>(
        async () => false,
      ),
    });
    const reply = createReply();

    const outcome = await handleLineMessages(
      body(mentionEvent()),
      reply,
      context(gateway),
    );

    expect(outcome).toEqual({ created: 0, failed: 0, unauthorized: 0 });
    expect(gateway.createIssue).not.toHaveBeenCalled();
    expect(gateway.completeReport).not.toHaveBeenCalled();
    expect(reply.replyText).not.toHaveBeenCalled();
  });

  it("GitHubが失敗したら記録を返上してエラーを返信し、例外を投げない (AC-LBR-009-1)", async () => {
    const gateway = createGateway({
      createIssue: vi.fn<LineBugReportGateway["createIssue"]>(async () => {
        throw new Error("GITHUB_ISSUE_FAILED_503");
      }),
    });
    const reply = createReply();

    const outcome = await handleLineMessages(
      body(mentionEvent()),
      reply,
      context(gateway),
    );

    expect(outcome).toEqual({ created: 0, failed: 1, unauthorized: 0 });
    expect(gateway.releaseReport).toHaveBeenCalledWith(MESSAGE_ID);
    expect(gateway.completeReport).not.toHaveBeenCalled();
    expect(reply.replyText).toHaveBeenCalledWith(
      REPLY_TOKEN,
      "起票できませんでした。時間をおいて再度お試しください。",
    );
  });

  it("返信やDBの失敗でも例外を投げず結果を返す", async () => {
    const gateway = createGateway({
      fetchLinkedLineGroupId: vi.fn<
        LineBugReportGateway["fetchLinkedLineGroupId"]
      >(async () => {
        throw new Error("DB_DOWN");
      }),
    });
    const reply = {
      replyText: vi.fn<LineReplyGateway["replyText"]>(async () => {
        throw new Error("LINE_REPLY_FAILED_400");
      }),
    };

    await expect(
      handleLineMessages(body(mentionEvent()), reply, context(gateway)),
    ).resolves.toEqual({ created: 0, failed: 1, unauthorized: 0 });
  });

  it("起票用設定が無いときはメンションを処理しない (AC-LBR-010-1)", async () => {
    const reply = createReply();

    const outcome = await handleLineMessages(body(mentionEvent()), reply, null);

    expect(outcome).toEqual({ created: 0, failed: 0, unauthorized: 0 });
    expect(reply.replyText).not.toHaveBeenCalled();
  });

  it("1対1トークのIDには送信者自身のuserIdだけを返信し、グループでは返信しない (AC-LBR-011-1)", async () => {
    const gateway = createGateway();
    const reply = createReply();

    await handleLineMessages(
      body(
        mentionEvent({
          source: { type: "user", groupId: undefined, userId: OTHER_USER_ID },
          message: { id: "1", text: " id ", mention: undefined },
        }),
        mentionEvent({
          message: { id: "2", text: "ID", mention: undefined },
        }),
        mentionEvent({
          source: { type: "user", groupId: undefined, userId: OTHER_USER_ID },
          message: { id: "3", text: "こんにちは", mention: undefined },
        }),
      ),
      reply,
      null,
    );

    expect(reply.replyText).toHaveBeenCalledTimes(1);
    expect(reply.replyText).toHaveBeenCalledWith(
      REPLY_TOKEN,
      `あなたのLINE userIdです。起票を許可する場合は管理者へ伝えてください。\n${OTHER_USER_ID}`,
    );
    expect(gateway.claimReport).not.toHaveBeenCalled();
  });

  it("不正なJSONや形式のeventは無視する", async () => {
    const reply = createReply();
    const gateway = createGateway();

    await expect(
      handleLineMessages("not json", reply, context(gateway)),
    ).resolves.toEqual({ created: 0, failed: 0, unauthorized: 0 });
    await expect(
      handleLineMessages(
        body(
          mentionEvent({ message: { id: "bad id!" } }),
          mentionEvent({ replyToken: null }),
          { type: "message" },
        ),
        reply,
        context(gateway),
      ),
    ).resolves.toEqual({ created: 0, failed: 0, unauthorized: 0 });
    expect(gateway.createIssue).not.toHaveBeenCalled();
  });
});
