import { z } from "zod";

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
