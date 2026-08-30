import { describe, expect, it } from "vitest";

import { buildMovedCategoryIds } from "./category-order";

const ids = ["a", "b", "c"] as const;

describe("buildMovedCategoryIds", () => {
  it("対象を1つ上のカテゴリと入れ替える", () => {
    expect(buildMovedCategoryIds(ids, "b", "up")).toEqual({
      kind: "moved",
      categoryIds: ["b", "a", "c"],
    });
  });

  it("対象を1つ下のカテゴリと入れ替える", () => {
    expect(buildMovedCategoryIds(ids, "b", "down")).toEqual({
      kind: "moved",
      categoryIds: ["a", "c", "b"],
    });
  });

  it("元の並びを変更しない", () => {
    const source = ["a", "b", "c"];
    buildMovedCategoryIds(source, "a", "down");
    expect(source).toEqual(["a", "b", "c"]);
  });

  it("先頭の上移動と末尾の下移動をat_edgeとして扱う", () => {
    expect(buildMovedCategoryIds(ids, "a", "up")).toEqual({ kind: "at_edge" });
    expect(buildMovedCategoryIds(ids, "c", "down")).toEqual({
      kind: "at_edge",
    });
  });

  it("並びに存在しないカテゴリをnot_foundとして扱う", () => {
    expect(buildMovedCategoryIds(ids, "x", "up")).toEqual({
      kind: "not_found",
    });
    expect(buildMovedCategoryIds([], "a", "down")).toEqual({
      kind: "not_found",
    });
  });
});
