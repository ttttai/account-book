import { z } from "zod";

// グループ作成フォーム入力の検証スキーマ（週開始曜日は文字列から数値へ変換）
export const createGroupSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "グループ名を入力してください。")
    .max(50, "グループ名は50文字以内で入力してください。"),
  weekStartsOn: z.enum(["0", "1"]).transform(Number),
  defaultAllocation: z.enum(["equal", "self"]),
});

export type CreateGroupInput = z.infer<typeof createGroupSchema>;
