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

export const CATEGORY_COLORS = [
  "food",
  "daily",
  "home",
  "utilities",
  "transport",
  "leisure",
  "other",
  "salary",
  "extra",
  "orange",
  "olive",
  "mint",
  "sky",
  "indigo",
  "navy",
  "rose",
  "wine",
  "charcoal",
] as const;

export const categoryColorSchema = z.enum(CATEGORY_COLORS);

// 保存済みの色文字列を許可済みtokenへ正規化する。未定義・許可外は既定色otherへ寄せ、任意文字列を表示層へ渡さない
export function toCategoryColor(value: unknown): CategoryColor {
  const result = categoryColorSchema.safeParse(value);
  return result.success ? result.data : "other";
}

export const updateCategorySchema = z.object({
  groupId: z.uuid(),
  categoryId: z.uuid(),
  name: categoryNameSchema,
  color: categoryColorSchema,
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
export type CategoryColor = z.infer<typeof categoryColorSchema>;
export type UpdateCategoryInput = z.infer<typeof updateCategorySchema>;
export type ArchiveCategoryInput = z.infer<typeof archiveCategorySchema>;
export type RepositionCategoryInput = z.infer<typeof repositionCategorySchema>;
