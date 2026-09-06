import { z } from "zod";

const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "YYYY-MM形式で指定してください。");

const amountMinorSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "1円以上の整数で入力してください。")
  .transform(Number)
  .refine(Number.isSafeInteger, "金額が大きすぎます。");

// 空文字は「この月に既存の改定がない（新規作成）」を意味し、nullへ変換する (AC-BUD-009-1)
const expectedVersionSchema = z
  .string()
  .transform((value) => value.trim())
  .refine(
    (value) => value === "" || /^[1-9]\d*$/.test(value),
    "更新の前提となるversionが不正です。",
  )
  .transform((value) => (value === "" ? null : Number(value)))
  .refine(
    (value) => value === null || Number.isSafeInteger(value),
    "更新の前提となるversionが不正です。",
  );

const categoryLimitSchema = z.object({
  categoryId: z.uuid(),
  amountMinor: amountMinorSchema,
});

// 予算の設定・改定入力。FormData由来の文字列を検証済みの値へ変換する (AC-BUD-002-1、AC-BUD-002-2)
export const setBudgetInputSchema = z
  .object({
    groupId: z.uuid(),
    effectiveMonth: monthSchema,
    expectedVersion: expectedVersionSchema,
    totalAmountMinor: amountMinorSchema,
    categoryLimits: z.array(categoryLimitSchema).max(200),
  })
  .superRefine((input, context) => {
    const seen = new Set<string>();
    let total = 0;
    for (const limit of input.categoryLimits) {
      if (seen.has(limit.categoryId)) {
        context.addIssue({
          code: "custom",
          path: ["categoryLimits"],
          message: "同じカテゴリを複数回設定できません。",
        });
        return;
      }
      seen.add(limit.categoryId);
      total += limit.amountMinor;
      if (!Number.isSafeInteger(total)) {
        context.addIssue({
          code: "custom",
          path: ["categoryLimits"],
          message: "カテゴリ予算の合計が大きすぎます。",
        });
        return;
      }
    }
    if (total > input.totalAmountMinor) {
      context.addIssue({
        code: "custom",
        path: ["categoryLimits"],
        message: "カテゴリ予算の合計はグループ予算以下にしてください。",
      });
    }
  });

export type SetBudgetInput = z.infer<typeof setBudgetInputSchema>;

// 予算の停止入力 (AC-BUD-006-1)
export const disableBudgetInputSchema = z.object({
  groupId: z.uuid(),
  effectiveMonth: monthSchema,
  expectedVersion: expectedVersionSchema,
});

export type DisableBudgetInput = z.infer<typeof disableBudgetInputSchema>;
