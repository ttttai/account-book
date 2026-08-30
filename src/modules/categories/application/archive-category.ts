import "server-only";

import { z } from "zod";

import {
  createServerSupabaseClient,
  getAllowedGoogleUserId,
} from "@/modules/auth/server";

import {
  archiveCategorySchema,
  type ArchiveCategoryInput,
} from "../domain/category-input";
import {
  CategoryCommandError,
  toCategoryCommandError,
} from "./category-command-error";

const archiveResultSchema = z.enum(["archived", "already_archived"]);

export type ArchiveCategoryResult = z.infer<typeof archiveResultSchema>;

export async function archiveCategory(
  input: ArchiveCategoryInput,
): Promise<ArchiveCategoryResult> {
  const validatedInput = archiveCategorySchema.parse(input);

  const supabase = await createServerSupabaseClient();
  const { data: claimsData, error: claimsError } =
    await supabase.auth.getClaims();
  if (claimsError || !getAllowedGoogleUserId(claimsData?.claims)) {
    throw new CategoryCommandError("UNAUTHENTICATED");
  }

  const { data, error } = await supabase.rpc("archive_group_category", {
    p_group_id: validatedInput.groupId,
    p_category_id: validatedInput.categoryId,
  });
  if (error) throw toCategoryCommandError(error);

  return archiveResultSchema.parse(data);
}
