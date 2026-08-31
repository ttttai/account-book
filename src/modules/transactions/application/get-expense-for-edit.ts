import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import { inferAllocationMethod } from "../domain/allocation-method-inference";
import type { ExpenseEditData } from "./edit-types";
import { getExpenseFormOptions } from "./get-expense-form-options";

const idSchema = z.uuid();
const transactionRowSchema = z.object({
  id: z.uuid(),
  type: z.enum(["expense", "income"]),
  amount_minor: z.number().int(),
  transaction_date: z.string(),
  category_id: z.uuid(),
  payer_member_id: z.uuid().nullable(),
  recipient_member_id: z.uuid().nullable(),
  memo: z.string().nullable(),
  version: z.number().int(),
  deleted_at: z.string().nullable(),
});
const allocationRowSchema = z.object({
  member_id: z.uuid(),
  amount_minor: z.number().int(),
});
const categoryRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.string(),
});
const memberRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
});
const profileRowSchema = z.object({
  user_id: z.uuid(),
  display_name: z.string(),
});

type Supabase = Awaited<ReturnType<typeof createServerSupabaseClient>>;

// 削除済みメンバーの表示名を履歴用に解決する（RLSで読めない場合はfallback）
async function resolveRemovedMemberName(
  supabase: Supabase,
  groupId: string,
  memberId: string,
): Promise<string> {
  const { data: memberData } = await supabase
    .from("group_members")
    .select("id, user_id")
    .eq("id", memberId)
    .eq("group_id", groupId)
    .maybeSingle();
  const removedMember = memberRowSchema.safeParse(memberData);
  if (!removedMember.success) return "削除済みメンバー";

  const { data: profileData } = await supabase
    .from("profiles")
    .select("user_id, display_name")
    .eq("user_id", removedMember.data.user_id)
    .maybeSingle();
  const profile = profileRowSchema.safeParse(profileData);
  return profile.success ? profile.data.display_name : "削除済みメンバー";
}

// 編集画面用に、対象取引（支出・収入）の現在値とフォーム選択肢をまとめて返す（削除済み・非対象はnull）
export async function getExpenseForEdit(
  unsafeGroupId: string,
  unsafeTransactionId: string,
): Promise<ExpenseEditData | null> {
  const groupIdResult = idSchema.safeParse(unsafeGroupId);
  const transactionIdResult = idSchema.safeParse(unsafeTransactionId);
  if (!groupIdResult.success || !transactionIdResult.success) return null;

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !getAllowedGoogleUserId(claimsData?.claims)) return null;

  // フォーム選択肢の取得が認可（アクティブ所属）確認を兼ねる
  const options = await getExpenseFormOptions(groupIdResult.data);
  if (!options || options.categories.length === 0) return null;

  const [transactionResult, allocationResult] = await Promise.all([
    supabase
      .from("transactions")
      .select(
        "id, type, amount_minor, transaction_date, category_id, payer_member_id, recipient_member_id, memo, version, deleted_at",
      )
      .eq("id", transactionIdResult.data)
      .eq("group_id", groupIdResult.data)
      .maybeSingle(),
    supabase
      .from("transaction_allocations")
      .select("member_id, amount_minor")
      .eq("transaction_id", transactionIdResult.data)
      .eq("group_id", groupIdResult.data),
  ]);
  if (transactionResult.error || allocationResult.error) return null;
  if (!transactionResult.data) return null;

  const transaction = transactionRowSchema.parse(transactionResult.data);
  if (transaction.deleted_at !== null) return null;

  // 現在のカテゴリがアクティブ一覧に無い場合はアーカイブ済みとして追加表示する
  const activeCategoriesForType =
    transaction.type === "expense"
      ? options.categories
      : options.incomeCategories;
  let archivedCategory: ExpenseEditData["transaction"]["archivedCategory"];
  if (
    !activeCategoriesForType.some(
      (category) => category.id === transaction.category_id,
    )
  ) {
    const { data: categoryData, error: categoryError } = await supabase
      .from("categories")
      .select("id, name, color")
      .eq("id", transaction.category_id)
      .eq("group_id", groupIdResult.data)
      .maybeSingle();
    if (categoryError || !categoryData) return null;
    archivedCategory = categoryRowSchema.parse(categoryData);
  }

  if (transaction.type === "income") {
    if (transaction.recipient_member_id === null) return null;

    // 受取者が削除済みメンバーの場合は履歴用表示名を示し、フォームで変更を求める
    const activeRecipient = options.members.find(
      (member) => member.membershipId === transaction.recipient_member_id,
    );
    const recipientDisplayName =
      activeRecipient?.displayName ??
      (await resolveRemovedMemberName(
        supabase,
        groupIdResult.data,
        transaction.recipient_member_id,
      ));

    return {
      options,
      transaction: {
        type: "income",
        id: transaction.id,
        amountMinor: transaction.amount_minor,
        transactionDate: transaction.transaction_date,
        categoryId: transaction.category_id,
        archivedCategory,
        recipientMemberId: transaction.recipient_member_id,
        recipientIsActive: Boolean(activeRecipient),
        recipientDisplayName,
        memo: transaction.memo,
        version: transaction.version,
      },
    };
  }

  if (transaction.payer_member_id === null) return null;

  const allocations = z
    .array(allocationRowSchema)
    .parse(allocationResult.data ?? [])
    .map((row) => ({ memberId: row.member_id, amountMinor: row.amount_minor }));

  // 支払者が削除済みメンバーの場合は履歴用表示名を示し、フォームで変更を求める
  const activePayer = options.members.find(
    (member) => member.membershipId === transaction.payer_member_id,
  );
  const payerDisplayName =
    activePayer?.displayName ??
    (await resolveRemovedMemberName(
      supabase,
      groupIdResult.data,
      transaction.payer_member_id,
    ));

  return {
    options,
    transaction: {
      type: "expense",
      id: transaction.id,
      amountMinor: transaction.amount_minor,
      transactionDate: transaction.transaction_date,
      categoryId: transaction.category_id,
      archivedCategory,
      payerMemberId: transaction.payer_member_id,
      payerIsActive: Boolean(activePayer),
      payerDisplayName,
      memo: transaction.memo,
      version: transaction.version,
      allocationMethod: inferAllocationMethod(
        transaction.amount_minor,
        allocations,
      ),
      allocations,
    },
  };
}
