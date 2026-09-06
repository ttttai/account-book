import { describe, expect, it } from "vitest";

import {
  addCategorySchema,
  archiveCategorySchema,
  CATEGORY_COLORS,
  normalizeCategoryName,
  toCategoryColor,
  updateCategorySchema,
} from "./category-input";

const groupId = "11111111-1111-4111-8111-111111111111";
const categoryId = "22222222-2222-4222-8222-222222222222";

describe("normalizeCategoryName", () => {
  it("前後の空白を除去する", () => {
    expect(normalizeCategoryName("  サブスク  ")).toBe("サブスク");
  });
});

describe("toCategoryColor", () => {
  it("許可済みの色tokenはそのまま返す", () => {
    expect(toCategoryColor("food")).toBe("food");
    expect(toCategoryColor("extra")).toBe("extra");
  });

  it("追加した9色のtokenもそのまま返す (AC-CAT-002-7)", () => {
    for (const color of [
      "orange",
      "olive",
      "mint",
      "sky",
      "indigo",
      "navy",
      "rose",
      "wine",
      "charcoal",
    ]) {
      expect(toCategoryColor(color)).toBe(color);
    }
  });

  it("パレットは18色で構成される (AC-CAT-002-7)", () => {
    expect(CATEGORY_COLORS).toHaveLength(18);
    expect(new Set(CATEGORY_COLORS).size).toBe(18);
  });

  it("未定義・許可外の色は既定色otherへ寄せる", () => {
    expect(toCategoryColor("green")).toBe("other");
    expect(toCategoryColor("red; background: url(x)")).toBe("other");
    expect(toCategoryColor("")).toBe("other");
    expect(toCategoryColor(null)).toBe("other");
    expect(toCategoryColor(undefined)).toBe("other");
  });
});

describe("addCategorySchema", () => {
  it("名称をtrimして追加入力を受け取る", () => {
    expect(
      addCategorySchema.parse({
        groupId,
        type: "expense",
        name: "  サブスク  ",
      }),
    ).toEqual({ groupId, type: "expense", name: "サブスク" });
  });

  it("30文字ちょうどの名称を受け取る", () => {
    expect(
      addCategorySchema.safeParse({
        groupId,
        type: "income",
        name: "あ".repeat(30),
      }).success,
    ).toBe(true);
  });

  it.each(["", "   ", "あ".repeat(31)])(
    "空白のみ・31文字以上の名称を拒否する",
    (name) => {
      expect(
        addCategorySchema.safeParse({ groupId, type: "expense", name }).success,
      ).toBe(false);
    },
  );

  it.each([
    { groupId: "not-a-uuid", type: "expense", name: "食費" },
    { groupId, type: "saving", name: "食費" },
    { groupId, type: "", name: "食費" },
  ])("不正なgroupId・種別を拒否する", (input) => {
    expect(addCategorySchema.safeParse(input).success).toBe(false);
  });
});

describe("updateCategorySchema", () => {
  it("名称をtrimし、パレット内の色を受け取る", () => {
    expect(
      updateCategorySchema.parse({
        groupId,
        categoryId,
        name: " 定期購入 ",
        color: "leisure",
      }),
    ).toEqual({ groupId, categoryId, name: "定期購入", color: "leisure" });
  });

  it("追加した色（navy）をパレット内として受け取る (AC-CAT-002-7)", () => {
    expect(
      updateCategorySchema.safeParse({
        groupId,
        categoryId,
        name: "定期購入",
        color: "navy",
      }).success,
    ).toBe(true);
  });

  it("パレット外の色を拒否する", () => {
    expect(
      updateCategorySchema.safeParse({
        groupId,
        categoryId,
        name: "定期購入",
        color: "#ff0000",
      }).success,
    ).toBe(false);
  });

  it("不正なcategoryIdを拒否する", () => {
    expect(
      updateCategorySchema.safeParse({
        groupId,
        categoryId: "not-a-uuid",
        name: "定期購入",
        color: "food",
      }).success,
    ).toBe(false);
  });
});

describe("archiveCategorySchema", () => {
  it("groupIdとcategoryIdの両方を必須にする", () => {
    expect(archiveCategorySchema.safeParse({ groupId }).success).toBe(false);
    expect(
      archiveCategorySchema.safeParse({ groupId, categoryId }).success,
    ).toBe(true);
  });
});
