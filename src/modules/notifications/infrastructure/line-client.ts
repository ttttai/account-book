import "server-only";

import { randomUUID } from "node:crypto";

const LINE_TIMEOUT_MS = 10_000;

// LINE Messaging APIでグループトークへテキストを1通pushする。
// 失敗時はtoken等を含まない一般化したエラーだけを投げる (NOTIF-009)
export async function pushLineTextMessage(
  channelAccessToken: string,
  lineGroupId: string,
  text: string,
): Promise<void> {
  const response = await fetch("https://api.line.me/v2/bot/message/push", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`,
      // LINE側の再送重複防止キー
      "X-Line-Retry-Key": randomUUID(),
    },
    body: JSON.stringify({
      to: lineGroupId,
      messages: [{ type: "text", text }],
    }),
    signal: AbortSignal.timeout(LINE_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`LINE_PUSH_FAILED_${response.status}`);
  }
}

// replyTokenでテキストを1通返信する（Reply API、無料。LBR-008）。
// 失敗時はtoken等を含まない一般化したエラーだけを投げる
export async function replyLineTextMessage(
  channelAccessToken: string,
  replyToken: string,
  text: string,
): Promise<void> {
  const response = await fetch("https://api.line.me/v2/bot/message/reply", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: "text", text }],
    }),
    signal: AbortSignal.timeout(LINE_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`LINE_REPLY_FAILED_${response.status}`);
  }
}
