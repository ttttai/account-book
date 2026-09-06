/** LINEの`message.id`。数字列だが安全側に英数字・`_`・`-`を許容する */
export const LINE_MESSAGE_ID_PATTERN = /^[0-9A-Za-z_-]{1,64}$/;
/** LINEのuserId。`U`と32桁の16進小文字 */
export const LINE_USER_ID_PATTERN = /^U[0-9a-f]{32}$/;

const TITLE_PREFIX = "bug(line): ";
const TITLE_MAX_CODE_POINTS = 60;
const UNFILLED = "（LINEからの報告のため未記入。確認後に追記する）";

export type LineMentionee = Readonly<{
  index: number;
  length: number;
  isSelf: boolean;
}>;

export type LineMentionText = Readonly<{
  text: string;
  mentionees: readonly LineMentionee[];
}>;

export type BugReportIssue = Readonly<{
  title: string;
  body: string;
  labels: readonly string[];
}>;

export type BugReportSourceInfo = Readonly<{
  messageId: string;
  receivedAt: Date;
}>;

export const BUG_REPORT_FAILED_REPLY =
  "起票できませんでした。時間をおいて再度お試しください。";
export const BUG_REPORT_EMPTY_REPLY =
  "報告内容が空です。メンションの後に不具合の内容を書いてください。";

// botへのメンションを含むtextから、メンション部分（@Allや他ユーザーを含む）を除いた本文を返す (LBR-001, AC-LBR-001-2)。
// bot自身（isSelf）へのメンションが無ければnull。範囲外のメンション位置は無視する
export function extractMentionedText(message: LineMentionText): string | null {
  if (!message.mentionees.some((mentionee) => mentionee.isSelf)) return null;

  const spans = message.mentionees
    .filter(
      (mentionee) =>
        Number.isInteger(mentionee.index) &&
        Number.isInteger(mentionee.length) &&
        mentionee.index >= 0 &&
        mentionee.length > 0 &&
        mentionee.index + mentionee.length <= message.text.length,
    )
    .sort((left, right) => right.index - left.index);

  let text = message.text;
  for (const span of spans) {
    text = text.slice(0, span.index) + text.slice(span.index + span.length);
  }
  return text.replace(/\r\n?/g, "\n").trim();
}

function truncateCodePoints(value: string, max: number): string {
  return Array.from(value).slice(0, max).join("");
}

// 本文中の最長のbacktick連続より長いfenceを返し、本文がコードブロックを閉じられないようにする (LBR-004)
function fenceFor(text: string): string {
  const longest = Math.max(
    0,
    ...Array.from(text.matchAll(/`+/g), (match) => match[0].length),
  );
  return "`".repeat(Math.max(3, longest + 1));
}

// LINEの本文からGitHub Issueのタイトル・本文・ラベルを固定テンプレートで組み立てる (LBR-004, LBR-005)。
// 本文はコードブロック内にだけ転記し、報告元にはmessage.idと受信日時だけを載せる
export function buildBugReportIssue(
  text: string,
  source: BugReportSourceInfo,
): BugReportIssue {
  const firstLine =
    text
      .split("\n")
      .map((line) => line.trim())
      .find((line) => line.length > 0) ?? "";
  const fence = fenceFor(text);
  const body = [
    "## 概要",
    "",
    `${fence}text`,
    text,
    fence,
    "",
    "## 再現手順",
    "",
    UNFILLED,
    "",
    "## 期待する動作",
    "",
    UNFILLED,
    "",
    "## 実際の動作",
    "",
    UNFILLED,
    "",
    "## 影響範囲",
    "",
    UNFILLED,
    "",
    "## 重要度",
    "",
    UNFILLED,
    "",
    "## 報告元",
    "",
    "- 経路: LINEグループトーク（botへのメンション）",
    `- LINE message.id: \`${source.messageId}\``,
    `- 受信日時（UTC）: ${source.receivedAt.toISOString()}`,
    "",
  ].join("\n");

  return {
    title: `${TITLE_PREFIX}${truncateCodePoints(firstLine, TITLE_MAX_CODE_POINTS)}`,
    body,
    labels: ["bug", "source:line"],
  };
}

// 起票成功の返信文 (LBR-008)
export function formatIssueCreatedReply(
  issueNumber: number,
  issueUrl: string,
): string {
  return `不具合Issueを作成しました。\n#${issueNumber} ${issueUrl}`;
}

// 1対1トークで自分のuserIdを尋ねる本文かを判定する (LBR-011)
export function isUserIdRequest(text: string): boolean {
  return text.trim().toLowerCase() === "id";
}

// 送信者自身のuserIdだけを返す返信文 (LBR-011)
export function formatUserIdReply(userId: string): string {
  return `あなたのLINE userIdです。起票を許可する場合は管理者へ伝えてください。\n${userId}`;
}
