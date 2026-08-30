import "server-only";

import { z } from "zod";

import { linkLineGroup, unlinkLineGroup } from "../infrastructure/notifier-db";
import type { NotifierConfig } from "../infrastructure/notifier-config";

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
// グループへのjoinで連携を登録し、leaveで解除する。それ以外のeventは無視する
export async function handleLineWebhook(
  config: NotifierConfig,
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
    if (!lineGroupId) continue;

    if (event.type === "join") {
      await linkLineGroup(config.databaseUrl, config.groupId, lineGroupId);
    } else if (event.type === "leave") {
      await unlinkLineGroup(config.databaseUrl, lineGroupId);
    }
  }
}
