import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import { dateInTimeZone } from "../domain/date-in-time-zone";
import {
  buildTransactionSaveFeedback,
  type TransactionSaveFeedback,
  type TransactionSaveOperation,
  type TransactionType,
} from "../domain/save-feedback";

const inputSchema = z.object({
  groupId: z.uuid(),
  transactionId: z.uuid(),
});
const transactionRowSchema = z.object({
  type: z.enum(["expense", "income"]),
  amount_minor: z.number().int(),
  transaction_date: z.string(),
  categories: z.object({ name: z.string() }).nullable(),
});
const groupRowSchema = z.object({ timezone: z.string() });

type LoadTransactionSaveFeedbackInput = Readonly<{
  operation: TransactionSaveOperation;
  groupId: string;
  transactionId: string;
  /** 行を読めなかったときに見出しへ使う種別（登録・更新は種別が分かる。削除は不明） */
  fallbackType?: TransactionType;
}>;

// グループのタイムゾーンにおける今日。タイムゾーンを読めない・不正な場合はUTCの今日へ倒す
function resolveToday(timeZone: string | undefined): string {
  const now = new Date();
  if (timeZone) {
    try {
      return dateInTimeZone(now, timeZone);
    } catch {
      // 不正なタイムゾーンはUTCで判定する
    }
  }
  return now.toISOString().slice(0, 10);
}

// 保存済みの行（削除は削除前の行）とカテゴリ名・グループのタイムゾーンを読んで通知内容を組み立てる。
// 読めない場合は見出しだけを返し、保存の成否には影響させない (AC-TXN-019-3)
export async function loadTransactionSaveFeedback({
  operation,
  groupId,
  transactionId,
  fallbackType,
}: LoadTransactionSaveFeedbackInput): Promise<TransactionSaveFeedback> {
  const titleOnly = () =>
    buildTransactionSaveFeedback({
      operation,
      snapshot: null,
      fallbackType,
      today: resolveToday(undefined),
    });

  const parsed = inputSchema.safeParse({ groupId, transactionId });
  if (!parsed.success) return titleOnly();

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !getAllowedGoogleUserId(claimsData?.claims)) {
    return titleOnly();
  }

  const [transactionResult, groupResult] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "type, amount_minor, transaction_date, categories!transactions_category_group_fk(name)",
      )
      .eq("id", parsed.data.transactionId)
      .eq("group_id", parsed.data.groupId)
      .maybeSingle(),
    supabase
      .from("groups")
      .select("timezone")
      .eq("id", parsed.data.groupId)
      .maybeSingle(),
  ]);

  const group = groupRowSchema.safeParse(groupResult.data);
  const today = resolveToday(group.success ? group.data.timezone : undefined);
  const row = transactionResult.error
    ? null
    : transactionRowSchema.safeParse(transactionResult.data);
  if (!row?.success || !row.data.categories) {
    return buildTransactionSaveFeedback({
      operation,
      snapshot: null,
      fallbackType,
      today,
    });
  }

  return buildTransactionSaveFeedback({
    operation,
    snapshot: {
      type: row.data.type,
      amountMinor: row.data.amount_minor,
      transactionDate: row.data.transaction_date,
      categoryName: row.data.categories.name,
    },
    fallbackType,
    today,
  });
}
