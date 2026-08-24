import { describe, expect, it } from "vitest";

import { DEFAULT_CATEGORIES } from "./default-categories";

describe("DEFAULT_CATEGORIES", () => {
  it("仕様どおり支出7件・収入3件を一意な順序で持つ", () => {
    expect(
      DEFAULT_CATEGORIES.filter((category) => category.type === "expense").map(
        (category) => category.name,
      ),
    ).toEqual(["食費", "日用品", "住居", "光熱費", "交通", "娯楽", "その他"]);
    expect(
      DEFAULT_CATEGORIES.filter((category) => category.type === "income").map(
        (category) => category.name,
      ),
    ).toEqual(["給与", "臨時収入", "その他"]);

    const identities = DEFAULT_CATEGORIES.map(
      (category) => `${category.type}:${category.name}`,
    );
    expect(new Set(identities).size).toBe(DEFAULT_CATEGORIES.length);
  });
});
