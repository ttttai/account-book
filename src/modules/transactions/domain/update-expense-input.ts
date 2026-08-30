import { z } from "zod";

import { createExpenseInputSchema } from "./expense-input";

const expectedVersionSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "更新の前提となるversionが不正です。")
  .transform(Number)
  .refine(Number.isSafeInteger, "更新の前提となるversionが不正です。");

// 支出編集入力の検証スキーマ。登録時と同じ制約に、対象取引IDと楽観的ロック用versionを加える
export const updateExpenseInputSchema = createExpenseInputSchema
  .omit({ clientRequestId: true })
  .extend({
    transactionId: z.uuid(),
    expectedVersion: expectedVersionSchema,
  });

export type UpdateExpenseInput = z.infer<typeof updateExpenseInputSchema>;
