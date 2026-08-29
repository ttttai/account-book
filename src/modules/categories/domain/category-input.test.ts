import { describe, expect, it } from "vitest";

import {
  addCategorySchema,
  archiveCategorySchema,
  moveCategorySchema,
  normalizeCategoryName,
  renameCategorySchema,
} from "./category-input";

const groupId = "11111111-1111-4111-8111-111111111111";
const categoryId = "22222222-2222-4222-8222-222222222222";

describe("normalizeCategoryName", () => {
  it("前後の空白を除去する", () => {
    expect(normalizeCategoryName("  サブスク  ")).toBe("サブスク");
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

describe("renameCategorySchema", () => {
  it("名称をtrimして変更入力を受け取る", () => {
    expect(
      renameCategorySchema.parse({ groupId, categoryId, name: " 定期購入 " }),
    ).toEqual({ groupId, categoryId, name: "定期購入" });
  });

  it("不正なcategoryIdを拒否する", () => {
    expect(
      renameCategorySchema.safeParse({
        groupId,
        categoryId: "1; drop table categories",
        name: "定期購入",
      }).success,
    ).toBe(false);
  });
});

describe("moveCategorySchema", () => {
  it("上下の移動方向だけを受け取る", () => {
    expect(
      moveCategorySchema.parse({ groupId, categoryId, direction: "up" }),
    ).toEqual({ groupId, categoryId, direction: "up" });
    expect(
      moveCategorySchema.safeParse({ groupId, categoryId, direction: "top" })
        .success,
    ).toBe(false);
  });

  it("移動方向の欠落をfail closedで拒否する", () => {
    expect(moveCategorySchema.safeParse({ groupId, categoryId }).success).toBe(
      false,
    );
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
