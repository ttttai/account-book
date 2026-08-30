import { describe, expect, it } from "vitest";

import { buildRepositionedCategoryIds } from "./category-order";

describe("buildRepositionedCategoryIds", () => {
  const ids = ["a", "b", "c", "d"] as const;

  it("対象を指定位置へ移動する（前方へ）", () => {
    expect(buildRepositionedCategoryIds(ids, "c", 0)).toEqual({
      kind: "moved",
      categoryIds: ["c", "a", "b", "d"],
    });
  });

  it("対象を指定位置へ移動する（後方へ）", () => {
    expect(buildRepositionedCategoryIds(ids, "a", 2)).toEqual({
      kind: "moved",
      categoryIds: ["b", "c", "a", "d"],
    });
  });

  it("末尾位置への移動を受け付ける", () => {
    expect(buildRepositionedCategoryIds(ids, "a", 3)).toEqual({
      kind: "moved",
      categoryIds: ["b", "c", "d", "a"],
    });
  });

  it("同じ位置への移動をunchangedとして扱う", () => {
    expect(buildRepositionedCategoryIds(ids, "b", 1)).toEqual({
      kind: "unchanged",
    });
  });

  it("範囲外の位置をnot_foundとして扱う", () => {
    expect(buildRepositionedCategoryIds(ids, "a", 4)).toEqual({
      kind: "not_found",
    });
    expect(buildRepositionedCategoryIds(ids, "a", -1)).toEqual({
      kind: "not_found",
    });
  });

  it("並びに存在しないカテゴリをnot_foundとして扱う", () => {
    expect(buildRepositionedCategoryIds(ids, "x", 0)).toEqual({
      kind: "not_found",
    });
  });

  it("元の並びを変更しない", () => {
    const source = ["a", "b", "c", "d"];
    buildRepositionedCategoryIds(source, "a", 3);
    expect(source).toEqual(["a", "b", "c", "d"]);
  });
});
