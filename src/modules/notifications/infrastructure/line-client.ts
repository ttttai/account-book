import "server-only";

import { randomUUID } from "node:crypto";

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
  });
  if (!response.ok) {
    throw new Error(`LINE_PUSH_FAILED_${response.status}`);
  }
}
