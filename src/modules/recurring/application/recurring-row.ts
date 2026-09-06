import "server-only";

import { z } from "zod";

import { firstDayToMonth } from "../domain/recurring-input";
import type { RecurringSchedule } from "../domain/recurring-schedule";

const safeAmountSchema = z.union([
  z.number().int().positive().max(Number.MAX_SAFE_INTEGER),
  z.string().regex(/^\d+$/).transform(Number).refine(Number.isSafeInteger),
]);

// `recurring_transactions`のselect結果。カテゴリと負担行をembedして1回で取得する
export const recurringRowSchema = z.object({
  id: z.uuid(),
  type: z.enum(["expense", "income"]),
  name: z.string(),
  amount_minor: safeAmountSchema,
  day_of_month: z.number().int().min(1).max(28),
  start_month: z.string(),
  end_month: z.string().nullable(),
  version: z.number().int().min(1),
  memo: z.string().nullable(),
  payer_member_id: z.uuid().nullable(),
  recipient_member_id: z.uuid().nullable(),
  categories: z.object({
    id: z.uuid(),
    name: z.string(),
    color: z.string(),
    icon: z.string(),
  }),
  recurring_transaction_allocations: z.array(
    z.object({ member_id: z.uuid(), amount_minor: safeAmountSchema }),
  ),
});

export type RecurringRow = z.infer<typeof recurringRowSchema>;

// DB行を、展開に使うドメイン型（月は`YYYY-MM`）へ変換する
export function toRecurringSchedule(row: RecurringRow): RecurringSchedule {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    memo: row.memo,
    amountMinor: row.amount_minor,
    dayOfMonth: row.day_of_month,
    startMonth: firstDayToMonth(row.start_month),
    endMonth: row.end_month === null ? null : firstDayToMonth(row.end_month),
    category: {
      id: row.categories.id,
      name: row.categories.name,
      color: row.categories.color,
      icon: row.categories.icon,
    },
    payerMemberId: row.payer_member_id,
    recipientMemberId: row.recipient_member_id,
    allocations: row.recurring_transaction_allocations.map((allocation) => ({
      memberId: allocation.member_id,
      amountMinor: allocation.amount_minor,
    })),
  };
}

export const RECURRING_SELECT_COLUMNS =
  "id, type, name, amount_minor, day_of_month, start_month, end_month, version, memo, payer_member_id, recipient_member_id, categories!recurring_transactions_category_group_fk(id, name, color, icon), recurring_transaction_allocations!recurring_transaction_allocations_recurring_group_fk(member_id, amount_minor)";
