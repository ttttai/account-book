import "server-only";

import { z } from "zod";

/** 連携の登録・解除を行う外部境界。DB実装は差し替え可能にする */
export type LineLinkGateway = Readonly<{
  link: (groupId: string, lineGroupId: string) => Promise<void>;
  unlink: (lineGroupId: string) => Promise<void>;
}>;

const LINE_GROUP_ID_PATTERN = /^[0-9A-Za-z_-]{1,64}$/;

const webhookBodySchema = z.object({
  events: z
    .array(
      z.object({
        type: z.string(),
        source: z
          .object({
            type: z.string(),
            groupId: z.string().optional(),
          })
          .optional(),
      }),
    )
    .max(100),
});

// 署名検証済みのLINE Webhook本文を処理する (NOTIF-004, AC-NOTIF-004-1)。
// グループへのjoinで連携を登録し、leaveで解除する。それ以外のeventとgroup以外のsourceは無視する
export async function handleLineWebhook(
  groupId: string,
  gateway: LineLinkGateway,
  rawBody: string,
): Promise<void> {
  let body: z.infer<typeof webhookBodySchema>;
  try {
    body = webhookBodySchema.parse(JSON.parse(rawBody));
  } catch {
    return;
  }

  for (const event of body.events) {
    const lineGroupId =
      event.source?.type === "group" ? event.source.groupId : undefined;
    if (!lineGroupId || !LINE_GROUP_ID_PATTERN.test(lineGroupId)) continue;

    if (event.type === "join") {
      await gateway.link(groupId, lineGroupId);
    } else if (event.type === "leave") {
      await gateway.unlink(lineGroupId);
    }
  }
}
