import { z } from "zod";

import { createExpenseInputSchema } from "./expense-input";
import { updateExpenseInputSchema } from "./update-expense-input";

// 収入登録入力の検証スキーマ。金額・日付・メモは支出と同じ規則を再利用し、受取者を必須にする
export const createIncomeInputSchema = createExpenseInputSchema
  .pick({
    groupId: true,
    amountMinor: true,
    transactionDate: true,
    categoryId: true,
    memo: true,
    clientRequestId: true,
  })
  .extend({
    recipientMemberId: z.uuid(),
  });

export type CreateIncomeInput = z.infer<typeof createIncomeInputSchema>;

// 収入編集入力の検証スキーマ。登録時と同じ制約に、対象取引IDと楽観的ロック用versionを加える
export const updateIncomeInputSchema = createIncomeInputSchema
  .omit({ clientRequestId: true })
  .extend({
    transactionId: z.uuid(),
    expectedVersion: updateExpenseInputSchema.shape.expectedVersion,
  });

export type UpdateIncomeInput = z.infer<typeof updateIncomeInputSchema>;
