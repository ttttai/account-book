import "server-only";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import {
  addCategorySchema,
  type AddCategoryInput,
} from "../domain/category-input";
import {
  CategoryCommandError,
  toCategoryCommandError,
} from "./category-command-error";

export async function addCategory(input: AddCategoryInput): Promise<void> {
  const validatedInput = addCategorySchema.parse(input);

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !getAllowedGoogleUserId(claimsData?.claims)) {
    throw new CategoryCommandError("UNAUTHENTICATED");
  }

  const { error } = await supabase.rpc("add_group_category", {
    p_group_id: validatedInput.groupId,
    p_type: validatedInput.type,
    p_name: validatedInput.name,
  });
  if (error) throw toCategoryCommandError(error);
}
