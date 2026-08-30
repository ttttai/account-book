import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import { toCsvContent } from "../domain/csv-cell";
import {
  buildTransactionCsvRows,
  TRANSACTION_CSV_HEADER,
  type ExportTransaction,
} from "../domain/export-columns";
import { buildCsvContentDisposition } from "../domain/export-filename";
import { parseExportPeriod } from "../domain/export-month";
import type { TransactionsCsvExport } from "./export-types";

// Excel\u3067UTF-8\u3068\u3057\u3066\u958B\u3051\u308B\u3088\u3046\u5148\u982D\u306BBOM\u3092\u4ED8\u4E0E\u3059\u308B
const UTF8_BOM = "\uFEFF";
const FALLBACK_DISPLAY_NAME = "メンバー";

const groupIdSchema = z.uuid();
const groupRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});
const membershipRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  status: z.enum(["active", "removed"]),
  joined_at: z.string(),
});
const profileRowSchema = z.object({
  user_id: z.uuid(),
  display_name: z.string(),
});
const safeAmountSchema = z.union([
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  z.string().regex(/^\d+$/).transform(Number).refine(Number.isSafeInteger),
]);
const transactionRowSchema = z.object({
  transaction_date: z.string(),
  type: z.enum(["expense", "income"]),
  amount_minor: safeAmountSchema,
  payer_member_id: z.uuid().nullable(),
  recipient_member_id: z.uuid().nullable(),
  memo: z.string().nullable(),
  categories: z.object({ name: z.string() }),
  transaction_allocations: z.array(
    z.object({
      member_id: z.uuid(),
      amount_minor: safeAmountSchema,
    }),
  ),
});

type MembershipRow = z.infer<typeof membershipRowSchema>;

// membership IDから表示名を引く関数を作る（退会者やprofile欠損はフォールバック名）
function createDisplayNameResolver(
  memberships: readonly MembershipRow[],
  displayNameByUserId: ReadonlyMap<string, string>,
): (membershipId: string | null) => string {
  const displayNameByMembershipId = new Map(
    memberships.map((membership) => [
      membership.id,
      displayNameByUserId.get(membership.user_id) ?? FALLBACK_DISPLAY_NAME,
    ]),
  );
  return (membershipId) =>
    (membershipId ? displayNameByMembershipId.get(membershipId) : undefined) ??
    FALLBACK_DISPLAY_NAME;
}

// 認証・所属確認のうえ、指定期間の取引をCSV文字列とダウンロード用ヘッダー値へ組み立てる
export async function getTransactionsCsvExport(
  unsafeGroupId: string,
  unsafeMonth: string | null,
): Promise<TransactionsCsvExport> {
  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const userId = getAllowedGoogleUserId(claimsData?.claims);
  if (claimsError || !userId) return { kind: "unauthenticated" };

  const groupIdResult = groupIdSchema.safeParse(unsafeGroupId);
  if (!groupIdResult.success) return { kind: "not_found" };

  const [groupResult, membershipResult] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name")
      .eq("id", groupIdResult.data)
      .maybeSingle(),
    supabase
      .from("group_members")
      .select("id, user_id, status, joined_at")
      .eq("group_id", groupIdResult.data)
      .order("joined_at", { ascending: true }),
  ]);
  if (groupResult.error || membershipResult.error || !groupResult.data) {
    return { kind: "not_found" };
  }

  const group = groupRowSchema.parse(groupResult.data);
  const memberships = z
    .array(membershipRowSchema)
    .parse(membershipResult.data ?? []);
  const currentMembership = memberships.find(
    (membership) =>
      membership.user_id === userId && membership.status === "active",
  );
  if (!currentMembership) return { kind: "not_found" };

  const periodResult = parseExportPeriod(unsafeMonth);
  if (!periodResult.success) return { kind: "invalid_month" };
  const period = periodResult.period;

  let transactionQuery = supabase
    .from("transactions")
    .select(
      "transaction_date, type, amount_minor, payer_member_id, recipient_member_id, memo, categories!transactions_category_group_fk(name), transaction_allocations!transaction_allocations_transaction_group_fk(member_id, amount_minor)",
    )
    .eq("group_id", group.id)
    .is("deleted_at", null);
  if (period.kind === "month") {
    transactionQuery = transactionQuery
      .gte("transaction_date", period.start)
      .lt("transaction_date", period.endExclusive);
  }

  const memberUserIds = memberships.map((membership) => membership.user_id);
  const [profileResult, transactionResult] = await Promise.all([
    supabase
      .from("profiles")
      .select("user_id, display_name")
      .in("user_id", memberUserIds),
    transactionQuery
      .order("transaction_date", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true }),
  ]);
  if (profileResult.error || transactionResult.error) {
    throw new Error("CSVを出力できませんでした。");
  }

  const displayNameByUserId = new Map(
    z
      .array(profileRowSchema)
      .parse(profileResult.data ?? [])
      .map((profile) => [profile.user_id, profile.display_name]),
  );
  const resolveDisplayName = createDisplayNameResolver(
    memberships,
    displayNameByUserId,
  );
  const membershipOrder = new Map(
    memberships.map((membership, index) => [membership.id, index]),
  );

  const transactions: readonly ExportTransaction[] = z
    .array(transactionRowSchema)
    .parse(transactionResult.data ?? [])
    .map((transaction) => ({
      transactionDate: transaction.transaction_date,
      type: transaction.type,
      amountMinor: transaction.amount_minor,
      categoryName: transaction.categories.name,
      partyDisplayName: resolveDisplayName(
        transaction.type === "expense"
          ? transaction.payer_member_id
          : transaction.recipient_member_id,
      ),
      // 負担内訳はメンバーの参加順で並べ、出力を安定させる
      allocations: [...transaction.transaction_allocations]
        .sort(
          (left, right) =>
            (membershipOrder.get(left.member_id) ?? Number.MAX_SAFE_INTEGER) -
            (membershipOrder.get(right.member_id) ?? Number.MAX_SAFE_INTEGER),
        )
        .map((allocation) => ({
          displayName: resolveDisplayName(allocation.member_id),
          amountMinor: allocation.amount_minor,
        })),
      memo: transaction.memo,
    }));

  const csv =
    UTF8_BOM +
    toCsvContent([
      [...TRANSACTION_CSV_HEADER],
      ...buildTransactionCsvRows(transactions),
    ]);
  return {
    kind: "ready",
    csv,
    contentDisposition: buildCsvContentDisposition(group.name, period.label),
  };
}
