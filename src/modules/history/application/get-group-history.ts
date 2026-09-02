import "server-only";

import { z } from "zod";

import {
  type GroupReadContext,
  loadGroupMembers,
  resolveGroupReadContext,
} from "@/modules/groups/server";

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
  toHistoryRow,
  type HistoryRowSource,
} from "../domain/history-row";
import type {
  GroupHistoryData,
  HistoryPageData,
  HistorySearchInput,
} from "./history-types";

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

type HistoryMember = Readonly<{
  membershipId: string;
  displayName: string;
  isActive: boolean;
  isCurrentUser: boolean;
}>;

type HistoryContext = Readonly<{
  read: GroupReadContext;
  members: readonly HistoryMember[];
  categories: readonly z.infer<typeof categoryRowSchema>[];
  displayNameByMembershipId: ReadonlyMap<string, string>;
}>;

// 履歴は過去の取引を参照するため、削除済みmembershipも絞り込み候補と表示名の解決に含める
async function loadHistoryContext(
  unsafeGroupId: string,
): Promise<HistoryContext | null> {
  const read = await resolveGroupReadContext(unsafeGroupId, {
    includeRemovedMembers: true,
  });
  if (!read) return null;

  const [groupMembers, categoryResult] = await Promise.all([
    loadGroupMembers(read),
    read.supabase
      .from("categories")
      .select("id, name, type, color")
      .eq("group_id", read.group.id)
      .order("type", { ascending: true })
      .order("sort_order", { ascending: true }),
  ]);
  if (categoryResult.error) return null;

  const categories = z
    .array(categoryRowSchema)
    .parse(categoryResult.data ?? []);
  const members: readonly HistoryMember[] = groupMembers.map((member) => ({
    membershipId: member.membershipId,
    displayName: member.displayName,
    isActive: member.status === "active",
    isCurrentUser: member.isCurrentUser,
  }));

  return {
    read,
    members,
    categories,
    displayNameByMembershipId: new Map(
      members.map((member) => [member.membershipId, member.displayName]),
    ),
  };
}

function createFilterContext(context: HistoryContext) {
  return {
    categoryIds: new Set(context.categories.map((category) => category.id)),
    membershipIds: new Set(
      context.members.map((member) => member.membershipId),
    ),
  };
}

async function queryHistoryPage(
  context: HistoryContext,
  filter: HistoryFilter,
): Promise<
  Readonly<{ sources: readonly HistoryRowSource[]; nextCursor?: string }>
> {
  let query = context.read.supabase
    .from("transactions")
    .select(
      filter.memberMemberId
        ? `${baseSelectColumns}, ${memberFilterSelectColumn}`
        : baseSelectColumns,
    )
    .eq("group_id", context.read.group.id)
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

// 認証・所属確認と絞り込み条件の検証を行い、履歴画面の初回表示データ一式を取得する
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
      groupId: context.read.group.id,
      reason: filterResult.reason,
    };
  }

  const { cursor, ...appliedFilter } = filterResult.value;
  const page = await queryHistoryPage(context, filterResult.value);

  return {
    kind: "ready",
    group: { id: context.read.group.id, name: context.read.group.name },
    currentMembershipId: context.read.currentMembershipId,
    filter: appliedFilter,
    ...(cursor ? { appliedCursor: encodeHistoryCursor(cursor) } : {}),
    members: context.members,
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
