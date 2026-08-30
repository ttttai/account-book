import { z } from "zod";

export const CATEGORY_NAME_MAX_LENGTH = 30;

export function normalizeCategoryName(value: string): string {
  return value.trim();
}

const categoryNameSchema = z
  .string()
  .transform(normalizeCategoryName)
  .refine(
    (name) => name.length >= 1 && name.length <= CATEGORY_NAME_MAX_LENGTH,
    `カテゴリ名は前後の空白を除いて1〜${CATEGORY_NAME_MAX_LENGTH}文字で入力してください。`,
  );

export const categoryTypeSchema = z.enum(["expense", "income"]);

export const addCategorySchema = z.object({
  groupId: z.uuid(),
  type: categoryTypeSchema,
  name: categoryNameSchema,
});

export const renameCategorySchema = z.object({
  groupId: z.uuid(),
  categoryId: z.uuid(),
  name: categoryNameSchema,
});

export const moveCategorySchema = z.object({
  groupId: z.uuid(),
  categoryId: z.uuid(),
  direction: z.enum(["up", "down"]),
});

export const repositionCategorySchema = z.object({
  groupId: z.uuid(),
  categoryId: z.uuid(),
  position: z.number().int().min(0),
});

export const archiveCategorySchema = z.object({
  groupId: z.uuid(),
  categoryId: z.uuid(),
});

export type CategoryType = z.infer<typeof categoryTypeSchema>;
export type AddCategoryInput = z.infer<typeof addCategorySchema>;
export type RenameCategoryInput = z.infer<typeof renameCategorySchema>;
export type MoveCategoryInput = z.infer<typeof moveCategorySchema>;
export type ArchiveCategoryInput = z.infer<typeof archiveCategorySchema>;
export type RepositionCategoryInput = z.infer<typeof repositionCategorySchema>;
