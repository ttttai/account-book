import "server-only";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import {
  updateCategorySchema,
  type UpdateCategoryInput,
} from "../domain/category-input";
import {
  CategoryCommandError,
  toCategoryCommandError,
} from "./category-command-error";

// カテゴリの名称と色を1つの操作で更新する。検証はDB関数側でも再確認する
export async function updateCategory(
  input: UpdateCategoryInput,
): Promise<void> {
  const validatedInput = updateCategorySchema.parse(input);

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !getAllowedGoogleUserId(claimsData?.claims)) {
    throw new CategoryCommandError("UNAUTHENTICATED");
  }

  const { error } = await supabase.rpc("update_group_category", {
    p_group_id: validatedInput.groupId,
    p_category_id: validatedInput.categoryId,
    p_name: validatedInput.name,
    p_color: validatedInput.color,
  });
  if (error) throw toCategoryCommandError(error);
}
