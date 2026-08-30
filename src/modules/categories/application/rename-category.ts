import "server-only";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import {
  renameCategorySchema,
  type RenameCategoryInput,
} from "../domain/category-input";
import {
  CategoryCommandError,
  toCategoryCommandError,
} from "./category-command-error";

export async function renameCategory(
  input: RenameCategoryInput,
): Promise<void> {
  const validatedInput = renameCategorySchema.parse(input);

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !getAllowedGoogleUserId(claimsData?.claims)) {
    throw new CategoryCommandError("UNAUTHENTICATED");
  }

  const { error } = await supabase.rpc("rename_group_category", {
    p_group_id: validatedInput.groupId,
    p_category_id: validatedInput.categoryId,
    p_name: validatedInput.name,
  });
  if (error) throw toCategoryCommandError(error);
}
