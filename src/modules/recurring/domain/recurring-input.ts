import { z } from "zod";

const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "YYYY-MM形式で入力してください。");

const optionalMonthSchema = z
  .string()
  .transform((value) => value.trim())
  .transform((value) => (value === "" ? null : value))
  .refine(
    (value) => value === null || /^\d{4}-(0[1-9]|1[0-2])$/.test(value),
    "YYYY-MM形式で入力してください。",
  );

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

const dayOfMonthSchema = z
  .string()
  .regex(/^([1-9]|1\d|2[0-8])$/, "1〜28の日付を選んでください。")
  .transform(Number);

const nameSchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length >= 1, "名称を入力してください。")
  .refine((value) => value.length <= 40, "名称は40文字以内です。");

const memoSchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => value.length <= 500, "メモは500文字以内です。")
  .transform((value) => (value === "" ? null : value));

const expectedVersionSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "更新の前提となるversionが不正です。")
  .transform(Number)
  .refine(Number.isSafeInteger, "更新の前提となるversionが不正です。");

// 定期取引の作成入力。FormData由来の文字列を検証済みの値へ変換する（AC-REC-001-2、AC-REC-001-3）
export const createRecurringInputSchema = z
  .object({
    groupId: z.uuid(),
    type: z.enum(["expense", "income"]),
    name: nameSchema,
    amountMinor: amountMinorSchema,
    dayOfMonth: dayOfMonthSchema,
    startMonth: monthSchema,
    endMonth: optionalMonthSchema,
    categoryId: z.uuid(),
    partyMemberId: z.uuid(),
    allocationMethod: z.enum(["equal", "single", "custom"]),
    selectedMemberIds: z.array(z.uuid()).max(100),
    customAllocations: z
      .array(
        z.object({ memberId: z.uuid(), amountMinor: customAmountMinorSchema }),
      )
      .max(100),
    memo: memoSchema,
  })
  .refine(
    (input) => input.endMonth === null || input.endMonth >= input.startMonth,
    { message: "終了月は開始月以降にしてください。", path: ["endMonth"] },
  );

export type CreateRecurringInput = z.infer<typeof createRecurringInputSchema>;

// 定期取引の編集入力。作成と同じ制約に、対象IDと楽観的ロック用versionを加える
export const updateRecurringInputSchema = z
  .object({
    groupId: z.uuid(),
    recurringTransactionId: z.uuid(),
    expectedVersion: expectedVersionSchema,
    type: z.enum(["expense", "income"]),
    name: nameSchema,
    amountMinor: amountMinorSchema,
    dayOfMonth: dayOfMonthSchema,
    startMonth: monthSchema,
    endMonth: optionalMonthSchema,
    categoryId: z.uuid(),
    partyMemberId: z.uuid(),
    allocationMethod: z.enum(["equal", "single", "custom"]),
    selectedMemberIds: z.array(z.uuid()).max(100),
    customAllocations: z
      .array(
        z.object({ memberId: z.uuid(), amountMinor: customAmountMinorSchema }),
      )
      .max(100),
    memo: memoSchema,
  })
  .refine(
    (input) => input.endMonth === null || input.endMonth >= input.startMonth,
    { message: "終了月は開始月以降にしてください。", path: ["endMonth"] },
  );

export type UpdateRecurringInput = z.infer<typeof updateRecurringInputSchema>;

// 定期取引の終了入力（AC-REC-003-2）
export const endRecurringInputSchema = z.object({
  groupId: z.uuid(),
  recurringTransactionId: z.uuid(),
  expectedVersion: expectedVersionSchema,
  endMonth: monthSchema,
});

export type EndRecurringInput = z.infer<typeof endRecurringInputSchema>;

// `YYYY-MM`を月初日の`YYYY-MM-DD`へ変換する（DBのdate列は月初日で保持する）
export function monthToFirstDay(month: string): string {
  return `${month}-01`;
}

// DBの月初日`YYYY-MM-DD`を`YYYY-MM`へ戻す
export function firstDayToMonth(date: string): string {
  return date.slice(0, 7);
}
