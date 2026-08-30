import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import { toCategorySummaries } from "../domain/category-summary";
import type { CategoryManagementView } from "./category-types";

const groupIdSchema = z.uuid();
const groupRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
});
const membershipRowSchema = z.object({
  role: z.enum(["owner", "admin", "member"]),
});
const categoryRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  type: z.enum(["expense", "income"]),
  color: z.string(),
  sort_order: z.number().int(),
});

export async function getCategoryManagement(
  unsafeGroupId: string,
): Promise<CategoryManagementView | null> {
  const groupIdResult = groupIdSchema.safeParse(unsafeGroupId);
  if (!groupIdResult.success) return null;

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  const userId = getAllowedGoogleUserId(claimsData?.claims);
  if (claimsError || !userId) return null;

  const [groupResult, membershipResult] = await Promise.all([
    supabase
      .from("groups")
      .select("id, name")
      .eq("id", groupIdResult.data)
      .maybeSingle(),
    supabase
      .from("group_members")
      .select("role")
      .eq("group_id", groupIdResult.data)
      .eq("user_id", userId)
      .eq("status", "active")
      .maybeSingle(),
  ]);
  if (
    groupResult.error ||
    membershipResult.error ||
    !groupResult.data ||
    !membershipResult.data
  ) {
    return null;
  }

  const group = groupRowSchema.parse(groupResult.data);
  const membership = membershipRowSchema.parse(membershipResult.data);

  // memberには権限不足だけを返し、カテゴリデータを取得しない。
  if (membership.role === "member") {
    return { kind: "forbidden" };
  }

  const { data: categoryData, error: categoryError } = await supabase
    .from("categories")
    .select("id, name, type, color, sort_order")
    .eq("group_id", groupIdResult.data)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
  if (categoryError) {
    throw new Error("カテゴリ一覧を取得できませんでした。");
  }

  const categories = z.array(categoryRowSchema).parse(categoryData ?? []);

  return {
    kind: "authorized",
    data: {
      group: { id: group.id, name: group.name },
      currentRole: membership.role,
      expenseCategories: toCategorySummaries(
        categories.filter((category) => category.type === "expense"),
      ),
      incomeCategories: toCategorySummaries(
        categories.filter((category) => category.type === "income"),
      ),
    },
  };
}
