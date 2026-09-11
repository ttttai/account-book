import { z } from "zod";

// グループ設定変更フォーム入力の検証スキーマ。通貨・タイムゾーンは入力に含めない (AC-GRP-013-2, AC-GRP-013-3)
export const updateGroupSettingsSchema = z.object({
  groupId: z.uuid(),
  name: z
    .string()
    .trim()
    .min(1, "グループ名を入力してください。")
    .max(50, "グループ名は50文字以内で入力してください。"),
  weekStartsOn: z.enum(["0", "1"]).transform(Number),
  defaultAllocation: z.enum(["equal", "self"]),
  // 読み込み時のversion。楽観的ロックの比較値としてDB関数へ渡す (AC-GRP-013-5)
  expectedVersion: z.coerce.number().int().min(1),
});

export type UpdateGroupSettingsInput = z.infer<
  typeof updateGroupSettingsSchema
>;

// Server Actionで検証済みの入力をapplication層で再検証するための、変換後の形のスキーマ
export const updateGroupSettingsCommandSchema = z.object({
  groupId: z.uuid(),
  name: z.string().trim().min(1).max(50),
  weekStartsOn: z.union([z.literal(0), z.literal(1)]),
  defaultAllocation: z.enum(["equal", "self"]),
  expectedVersion: z.number().int().min(1),
});
