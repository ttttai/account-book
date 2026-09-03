import { z } from "zod";

// 起動時に開くグループの設定・解除入力。groupIdはbind引数でも未信頼として検証する (AC-GRP-012-2)
export const setDefaultGroupSchema = z.object({
  groupId: z.uuid(),
  mode: z.enum(["set", "clear"]),
});

export type SetDefaultGroupInput = z.infer<typeof setDefaultGroupSchema>;
