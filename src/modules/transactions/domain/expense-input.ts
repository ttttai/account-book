import { z } from "zod";

export const MAX_SAFE_AMOUNT_MINOR = Number.MAX_SAFE_INTEGER;

const amountMinorSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "1円以上の整数で入力してください。")
  .transform(Number)
  .refine(Number.isSafeInteger, "金額が大きすぎます。");

const customAmountMinorSchema = z
  .string()
  .regex(/^\d+$/, "0円以上の整数で入力してください。")
  .transform(Number)
  .refine(Number.isSafeInteger, "金額が大きすぎます。");

function isCanonicalCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return false;
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

const memoSchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length <= 500, "メモは500文字以内です。")
  .transform((value) => (value === "" ? null : value));

// 支出登録入力の検証スキーマ（FormData由来の文字列を数値やnull許容メモへ変換する）
export const createExpenseInputSchema = z.object({
  groupId: z.uuid(),
  amountMinor: amountMinorSchema,
  transactionDate: z
    .string()
    .refine(isCanonicalCalendarDate, "正しい日付を入力してください。"),
  categoryId: z.uuid(),
  payerMemberId: z.uuid(),
  allocationMethod: z.enum(["equal", "single", "custom"]),
  selectedMemberIds: z.array(z.uuid()).max(100),
  customAllocations: z
    .array(
      z.object({
        memberId: z.uuid(),
        amountMinor: customAmountMinorSchema,
      }),
    )
    .max(100),
  memo: memoSchema,
  clientRequestId: z.uuid(),
});

export type CreateExpenseInput = z.infer<typeof createExpenseInputSchema>;
