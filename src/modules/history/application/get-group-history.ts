import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import {
  buildHistoryCursorCondition,
  encodeHistoryCursor,
} from "../domain/history-cursor";
import {
  getHistoryMonthRange,
  parseHistoryFilter,
  type HistoryFilter,
} from "../domain/history-filter";
import {
  compareHistoryRowSourcesDesc,
  historyFallbackDisplayName,
  toHistoryRow,
  type HistoryRowSource,
} from "../domain/history-row";
import type {
  GroupHistoryData,
  HistoryPageData,
  HistorySearchInput,
} from "./history-types";

// 削除済みメンバーのプロフィールはRLSで取得できないため、過去参照用の表示名で補う
const removedMemberDisplayName = "退会メンバー";

const groupIdSchema = z.uuid();
const groupRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});
const membershipRowSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  status: z.union([z.literal("active"), z.literal("removed")]),
});
const profileRowSchema = z.object({
  user_id: z.uuid(),
  display_name: z.string(),
});
const categoryRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: z.union([z.literal("expense"), z.literal("income")]),
  color: z.string(),
});
const safeAmountSchema = z.union([
  z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  z.string().regex(/^\d+$/).transform(Number).refine(Number.isSafeInteger),
]);
const transactionRowSchema = z.object({
  id: z.uuid(),
  type: z.union([z.literal("expense"), z.literal("income")]),
  transaction_date: z.string(),
  amount_minor: safeAmountSchema,
  memo: z.string().nullable(),
  payer_member_id: z.uuid().nullable(),
  recipient_member_id: z.uuid().nullable(),
  created_at: z.string(),
  categories: z.object({
    name: z.string(),
    color: z.string(),
    icon: z.string(),
  }),
  transaction_allocations: z.array(
    z.object({
      member_id: z.uuid(),
      amount_minor: safeAmountSchema,
    }),
  ),
});

const baseSelectColumns =
  "id, type, transaction_date, amount_minor, memo, payer_member_id, recipient_member_id, created_at, " +
  "categories!transactions_category_group_fk(name, color, icon), " +
  "transaction_allocations!transaction_allocations_transaction_group_fk(member_id, amount_minor)";
// 負担メンバー絞り込み用のinner join。表示用の負担内訳とは別名で分離する
const memberFilterSelectColumn =
  "member_filter:transaction_allocations!transaction_allocations_transaction_group_fk!inner(member_id)";

type HistoryContext = Readonly<{
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>;
  group: Readonly<{ id: string; name: string }>;
  currentMembershipId: string;
  memberships: readonly z.infer<typeof membershipRowSchema>[];
  categories: readonly z.infer<typeof categoryRowSchema>[];
  displayNameByMembershipId: ReadonlyMap<string, string>;
}>;

async function loadHistoryContext(
  unsafeGroupId: string,
): Promise<HistoryContext | null> {
  const groupIdResult = groupIdSchema.safeParse(unsafeGroupId);
  if (!groupIdResult.success) return null;

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const userId = getAllowedGoogleUserId(claimsData?.claims);
  if (claimsError || !userId) return null;

  const [groupResult, membershipResult, categoryResult] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name")
      .eq("id", groupIdResult.data)
      .maybeSingle(),
    supabase
      .from("group_members")
      .select("id, user_id, status")
      .eq("group_id", groupIdResult.data)
      .order("joined_at", { ascending: true }),
    supabase
      .from("categories")
      .select("id, name, type, color")
      .eq("group_id", groupIdResult.data)
      .order("type", { ascending: true })
      .order("sort_order", { ascending: true }),
  ]);
  if (
    groupResult.error ||
    membershipResult.error ||
    categoryResult.error ||
    !groupResult.data
  ) {
    return null;
  }

  const group = groupRowSchema.parse(groupResult.data);
  const memberships = z
    .array(membershipRowSchema)
    .parse(membershipResult.data ?? []);
  const categories = z
    .array(categoryRowSchema)
    .parse(categoryResult.data ?? []);

  // 履歴データはアクティブメンバーだけに返す
  const currentMembership = memberships.find(
    (membership) =>
      membership.user_id === userId && membership.status === "active",
  );
  if (!currentMembership) return null;

  const profileResult = await supabase
    .from("profiles")
    .select("user_id, display_name")
    .in(
      "user_id",
      memberships.map((membership) => membership.user_id),
    );
  if (profileResult.error) return null;

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
        (membership.status === "active"
          ? historyFallbackDisplayName
          : removedMemberDisplayName),
    ]),
  );

  return {
    supabase,
    group,
    currentMembershipId: currentMembership.id,
    memberships,
    categories,
    displayNameByMembershipId,
  };
}

function createFilterContext(context: HistoryContext) {
  return {
    categoryIds: new Set(context.categories.map((category) => category.id)),
    membershipIds: new Set(
      context.memberships.map((membership) => membership.id),
    ),
  };
}

async function queryHistoryPage(
  context: HistoryContext,
  filter: HistoryFilter,
): Promise<
  Readonly<{ sources: readonly HistoryRowSource[]; nextCursor?: string }>
> {
  let query = context.supabase
    .from("transactions")
    .select(
      filter.memberMemberId
        ? `${baseSelectColumns}, ${memberFilterSelectColumn}`
        : baseSelectColumns,
    )
    .eq("group_id", context.group.id)
    .is("deleted_at", null);

  if (filter.month) {
    const range = getHistoryMonthRange(filter.month);
    query = query
      .gte("transaction_date", range.start)
      .lt("transaction_date", range.endExclusive);
  }
  if (filter.type) query = query.eq("type", filter.type);
  if (filter.categoryId) query = query.eq("category_id", filter.categoryId);
  if (filter.payerMemberId) {
    query = query.eq("payer_member_id", filter.payerMemberId);
  }
  if (filter.recipientMemberId) {
    query = query.eq("recipient_member_id", filter.recipientMemberId);
  }
  if (filter.memberMemberId) {
    query = query.eq("member_filter.member_id", filter.memberMemberId);
  }
  if (filter.cursor) {
    query = query.or(buildHistoryCursorCondition(filter.cursor));
  }

  const result = await query
    .order("transaction_date", { ascending: false })
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(filter.limit + 1);
  if (result.error) {
    throw new Error("履歴を取得できませんでした。");
  }

  const sources = z
    .array(transactionRowSchema)
    .parse(result.data ?? [])
    .map((transaction): HistoryRowSource => ({
      id: transaction.id,
      type: transaction.type,
      transactionDate: transaction.transaction_date,
      amountMinor: transaction.amount_minor,
      createdAt: transaction.created_at,
      payerMemberId: transaction.payer_member_id,
      recipientMemberId: transaction.recipient_member_id,
      memo: transaction.memo,
      category: transaction.categories,
      allocations: transaction.transaction_allocations.map((allocation) => ({
        memberId: allocation.member_id,
        amountMinor: allocation.amount_minor,
      })),
    }))
    .sort(compareHistoryRowSourcesDesc);

  const pageSources = sources.slice(0, filter.limit);
  const lastSource = pageSources[pageSources.length - 1];
  const hasMore = sources.length > filter.limit;

  return {
    sources: pageSources,
    ...(hasMore && lastSource
      ? {
          nextCursor: encodeHistoryCursor({
            transactionDate: lastSource.transactionDate,
            createdAt: lastSource.createdAt,
            id: lastSource.id,
          }),
        }
      : {}),
  };
}

export async function getGroupHistory(
  unsafeGroupId: string,
  search: HistorySearchInput,
): Promise<GroupHistoryData | null> {
  const context = await loadHistoryContext(unsafeGroupId);
  if (!context) return null;

  const filterResult = parseHistoryFilter(search, createFilterContext(context));
  if (!filterResult.success) {
    return {
      kind: "invalid",
      groupId: context.group.id,
      reason: filterResult.reason,
    };
  }

  const { cursor, ...appliedFilter } = filterResult.value;
  const page = await queryHistoryPage(context, filterResult.value);

  return {
    kind: "ready",
    group: context.group,
    currentMembershipId: context.currentMembershipId,
    filter: appliedFilter,
    ...(cursor ? { appliedCursor: encodeHistoryCursor(cursor) } : {}),
    members: context.memberships.map((membership) => ({
      membershipId: membership.id,
      displayName:
        context.displayNameByMembershipId.get(membership.id) ??
        historyFallbackDisplayName,
      isActive: membership.status === "active",
      isCurrentUser: membership.id === context.currentMembershipId,
    })),
    categories: context.categories.map((category) => ({
      id: category.id,
      name: category.name,
      type: category.type,
      color: category.color,
    })),
    rows: page.sources.map((source) =>
      toHistoryRow(source, context.displayNameByMembershipId),
    ),
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
  };
}

// 「さらに読み込む」用の追加ページ。認証・所属・絞り込み・cursorを毎回再検証する
export async function getGroupHistoryPage(
  unsafeGroupId: string,
  search: HistorySearchInput,
): Promise<HistoryPageData | null> {
  const context = await loadHistoryContext(unsafeGroupId);
  if (!context) return null;

  const filterResult = parseHistoryFilter(search, createFilterContext(context));
  if (!filterResult.success) {
    return { kind: "invalid", reason: filterResult.reason };
  }

  const page = await queryHistoryPage(context, filterResult.value);
  return {
    kind: "page",
    rows: page.sources.map((source) =>
      toHistoryRow(source, context.displayNameByMembershipId),
    ),
    ...(page.nextCursor ? { nextCursor: page.nextCursor } : {}),
  };
}
