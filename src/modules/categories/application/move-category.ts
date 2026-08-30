import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import {
  moveCategorySchema,
  type MoveCategoryInput,
} from "../domain/category-input";
import { buildMovedCategoryIds } from "../domain/category-order";
import {
  CategoryCommandError,
  toCategoryCommandError,
} from "./category-command-error";

const targetRowSchema = z.object({
  id: z.uuid(),
  type: z.enum(["expense", "income"]),
});
const orderRowSchema = z.object({
  id: z.uuid(),
  sort_order: z.number().int(),
});

export type MoveCategoryResult = "moved" | "at_edge" | "not_found";

export async function moveCategory(
  input: MoveCategoryInput,
): Promise<MoveCategoryResult> {
  const validatedInput = moveCategorySchema.parse(input);

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !getAllowedGoogleUserId(claimsData?.claims)) {
    throw new CategoryCommandError("UNAUTHENTICATED");
  }

  const { data: targetData, error: targetError } = await supabase
    .from("categories")
    .select("id, type")
    .eq("id", validatedInput.categoryId)
    .eq("group_id", validatedInput.groupId)
    .is("archived_at", null)
    .maybeSingle();
  if (targetError) throw new CategoryCommandError("UNKNOWN");
  if (!targetData) return "not_found";

  const target = targetRowSchema.parse(targetData);
  const { data: orderData, error: orderError } = await supabase
    .from("categories")
    .select("id, sort_order")
    .eq("group_id", validatedInput.groupId)
    .eq("type", target.type)
    .is("archived_at", null)
    .order("sort_order", { ascending: true });
  if (orderError) throw new CategoryCommandError("UNKNOWN");

  const orderedCategoryIds = z
    .array(orderRowSchema)
    .parse(orderData ?? [])
    .map((row) => row.id);
  const moveResult = buildMovedCategoryIds(
    orderedCategoryIds,
    validatedInput.categoryId,
    validatedInput.direction,
  );
  if (moveResult.kind !== "moved") return moveResult.kind;

  const { error } = await supabase.rpc("reorder_group_categories", {
    p_group_id: validatedInput.groupId,
    p_type: target.type,
    p_category_ids: [...moveResult.categoryIds],
  });
  if (error) throw toCategoryCommandError(error);

  return "moved";
}
