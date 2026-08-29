import { describe, expect, it } from "vitest";

import { toCategorySummaries } from "./category-summary";

describe("toCategorySummaries", () => {
  it("sort_order順に並べたidと名称だけのDTOへ変換する", () => {
    const rows = [
      {
        id: "b",
        name: "日用品",
        sort_order: 1,
        color: "daily",
        icon: "basket",
        archived_at: null,
        group_id: "g",
      },
      {
        id: "a",
        name: "食費",
        sort_order: 0,
        color: "food",
        icon: "utensils",
        archived_at: null,
        group_id: "g",
      },
    ];

    const summaries = toCategorySummaries(rows);

    expect(summaries).toEqual([
      { id: "a", name: "食費" },
      { id: "b", name: "日用品" },
    ]);
    for (const summary of summaries) {
      expect(Object.keys(summary).sort()).toEqual(["id", "name"]);
    }
  });

  it("空の一覧を空配列として返す", () => {
    expect(toCategorySummaries([])).toEqual([]);
  });
});
