import { z } from "zod";

import { categoryColorSchema } from "@/modules/categories";

export const ASSET_CATEGORY_NAME_MAX_LENGTH = 20;
export const ASSET_ACTIVE_CATEGORY_LIMIT = 8;
/** 記録できる最も古い月 (AC-AST-002-2) */
export const ASSET_EARLIEST_MONTH = "2000-01";

export const assetMonthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, "YYYY-MM形式で指定してください。")
  .refine(
    (month) => month >= ASSET_EARLIEST_MONTH,
    "2000年1月以降の月を指定してください。",
  );

// 資産額は0以上の整数。空欄は0円として扱う (AC-AST-002-1、AC-AST-002-3)
const assetAmountSchema = z
  .string()
  .transform((value) => value.trim())
  .refine((value) => /^\d*$/.test(value), "0以上の整数で入力してください。")
  .transform((value) => (value === "" ? 0 : Number(value)))
  .refine(Number.isSafeInteger, "金額が大きすぎます。");

// 空文字は「この月に記録がない（新規作成）」を意味し、nullへ変換する (AC-AST-005-1)
const expectedVersionSchema = z
  .string()
  .transform((value) => value.trim())
  .refine(
    (value) => value === "" || /^[1-9]\d*$/.test(value),
    "更新の前提となるversionが不正です。",
  )
  .transform((value) => (value === "" ? null : Number(value)))
  .refine(
    (value) => value === null || Number.isSafeInteger(value),
    "更新の前提となるversionが不正です。",
  );

const requiredVersionSchema = z
  .string()
  .regex(/^[1-9]\d*$/, "更新の前提となるversionが不正です。")
  .transform(Number)
  .refine(Number.isSafeInteger, "更新の前提となるversionが不正です。");

const assetValueSchema = z.object({
  memberId: z.uuid(),
  categoryId: z.uuid(),
  amountMinor: assetAmountSchema,
});

// 資産記録の保存入力。FormData由来の文字列を検証済みの値へ変換し、同じセルの重複を拒否する (AC-AST-002-3)
export const saveAssetSnapshotInputSchema = z
  .object({
    groupId: z.uuid(),
    month: assetMonthSchema,
    expectedVersion: expectedVersionSchema,
    values: z.array(assetValueSchema).max(2000),
  })
  .superRefine((input, context) => {
    const seen = new Set<string>();
    for (const value of input.values) {
      const key = `${value.memberId}:${value.categoryId}`;
      if (seen.has(key)) {
        context.addIssue({
          code: "custom",
          path: ["values"],
          message: "同じメンバー・資産区分を複数回入力できません。",
        });
        return;
      }
      seen.add(key);
    }
  });

export type SaveAssetSnapshotInput = z.infer<
  typeof saveAssetSnapshotInputSchema
>;

// 資産記録の削除入力 (AC-AST-004-2)
export const deleteAssetSnapshotInputSchema = z.object({
  groupId: z.uuid(),
  month: assetMonthSchema,
  expectedVersion: requiredVersionSchema,
});

export type DeleteAssetSnapshotInput = z.infer<
  typeof deleteAssetSnapshotInputSchema
>;

// 資産区分名は前後空白を除いて1〜20文字 (AC-AST-006-2)
const assetCategoryNameSchema = z
  .string()
  .transform((value) => value.trim())
  .pipe(
    z
      .string()
      .min(1, "名前を入力してください。")
      .max(
        ASSET_CATEGORY_NAME_MAX_LENGTH,
        `名前は${ASSET_CATEGORY_NAME_MAX_LENGTH}文字以内で入力してください。`,
      ),
  );

export const createAssetCategoryInputSchema = z.object({
  groupId: z.uuid(),
  name: assetCategoryNameSchema,
  color: categoryColorSchema,
});

export type CreateAssetCategoryInput = z.infer<
  typeof createAssetCategoryInputSchema
>;

export const updateAssetCategoryInputSchema = z.object({
  groupId: z.uuid(),
  categoryId: z.uuid(),
  expectedVersion: requiredVersionSchema,
  name: assetCategoryNameSchema,
  color: categoryColorSchema,
});

export type UpdateAssetCategoryInput = z.infer<
  typeof updateAssetCategoryInputSchema
>;

// アーカイブ（削除）と復元を同じ入力で扱う (AC-AST-006-1)
export const setAssetCategoryArchivedInputSchema = z.object({
  groupId: z.uuid(),
  categoryId: z.uuid(),
  expectedVersion: requiredVersionSchema,
  archived: z.boolean(),
});

export type SetAssetCategoryArchivedInput = z.infer<
  typeof setAssetCategoryArchivedInputSchema
>;
