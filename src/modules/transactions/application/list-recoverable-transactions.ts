import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import { RESTORE_WINDOW_DAYS, restoreDeadline } from "../domain/restore-window";
import type { RecoverableTransaction } from "./edit-types";

const groupIdSchema = z.uuid();
const transactionRowSchema = z.object({
  id: z.uuid(),
  amount_minor: z.number().int(),
  transaction_date: z.string(),
  category_id: z.uuid(),
  payer_member_id: z.uuid().nullable(),
  recipient_member_id: z.uuid().nullable(),
  deleted_at: z.string(),
  version: z.number().int(),
});
const categoryRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.string(),
});
const memberRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  status: z.string(),
});
const profileRowSchema = z.object({
  user_id: z.uuid(),
  display_name: z.string(),
});

// 削除から30日以内の取引を復元一覧用の最小DTOとして削除日時の新しい順で返す（非メンバーはnull）
export async function listRecoverableTransactions(
  unsafeGroupId: string,
): Promise<readonly RecoverableTransaction[] | null> {
  const groupIdResult = groupIdSchema.safeParse(unsafeGroupId);
  if (!groupIdResult.success) return null;

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const userId = getAllowedGoogleUserId(claimsData?.claims);
  if (claimsError || !userId) return null;

  const [membershipResult, transactionResult] = await Promise.all([
    supabase
      .from("group_members")
      .select("id, user_id, status")
      .eq("group_id", groupIdResult.data),
    supabase
      .from("transactions")
      .select(
        "id, amount_minor, transaction_date, category_id, payer_member_id, recipient_member_id, deleted_at, version",
      )
      .eq("group_id", groupIdResult.data)
      .not("deleted_at", "is", null)
      .gt(
        "deleted_at",
        new Date(
          Date.now() - RESTORE_WINDOW_DAYS * 24 * 60 * 60 * 1000,
        ).toISOString(),
      )
      .order("deleted_at", { ascending: false }),
  ]);
  if (membershipResult.error || transactionResult.error) return null;

  const memberships = z
    .array(memberRowSchema)
    .parse(membershipResult.data ?? []);
  const currentMembership = memberships.find(
    (membership) =>
      membership.user_id === userId && membership.status === "active",
  );
  if (!currentMembership) return null;

  const transactions = z
    .array(transactionRowSchema)
    .parse(transactionResult.data ?? []);
  if (transactions.length === 0) return [];

  const [categoryResult, profileResult] = await Promise.all([
    supabase
      .from("categories")
      .select("id, name, color")
      .eq("group_id", groupIdResult.data),
    supabase
      .from("profiles")
      .select("user_id, display_name")
      .in(
        "user_id",
        memberships.map((membership) => membership.user_id),
      ),
  ]);
  if (categoryResult.error || profileResult.error) return null;

  const categoryById = new Map(
    z
      .array(categoryRowSchema)
      .parse(categoryResult.data ?? [])
      .map((category) => [category.id, category]),
  );
  const displayNameByUserId = new Map(
    z
      .array(profileRowSchema)
      .parse(profileResult.data ?? [])
      .map((profile) => [profile.user_id, profile.display_name]),
  );
  const displayNameByMembershipId = new Map(
    memberships.map((membership) => [
      membership.id,
      displayNameByUserId.get(membership.user_id) ??
        (membership.status === "active" ? "メンバー" : "削除済みメンバー"),
    ]),
  );

  return transactions.map((transaction) => {
    const category = categoryById.get(transaction.category_id);
    const partyMemberId =
      transaction.payer_member_id ?? transaction.recipient_member_id;
    return {
      id: transaction.id,
      amountMinor: transaction.amount_minor,
      transactionDate: transaction.transaction_date,
      categoryName: category?.name ?? "カテゴリ",
      categoryColor: category?.color ?? "gray",
      payerDisplayName: partyMemberId
        ? (displayNameByMembershipId.get(partyMemberId) ?? "メンバー")
        : "メンバー",
      deletedAt: transaction.deleted_at,
      restoreDeadline: restoreDeadline(transaction.deleted_at).toISOString(),
      version: transaction.version,
    };
  });
}
