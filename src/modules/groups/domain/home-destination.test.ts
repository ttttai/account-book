import { describe, expect, it } from "vitest";

import { resolveHomeDestination } from "./home-destination";

describe("resolveHomeDestination", () => {
  it("アクティブな所属が1件だけならそのグループの当月カレンダーへ直行する (AC-GRP-011-1)", () => {
    expect(
      resolveHomeDestination({
        groupIds: ["00000000-0000-4000-8000-000000000001"],
        view: undefined,
      }),
    ).toEqual({
      kind: "group",
      href: "/groups/00000000-0000-4000-8000-000000000001",
    });
  });

  it("所属が0件は作成画面、2件以上は一覧を表示し直行しない (AC-GRP-011-2)", () => {
    expect(resolveHomeDestination({ groupIds: [], view: undefined })).toEqual({
      kind: "list",
    });
    expect(
      resolveHomeDestination({
        groupIds: [
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
        ],
        view: undefined,
      }),
    ).toEqual({ kind: "list" });
  });

  it("view=groupsでは所属が1件でも一覧を表示する (AC-GRP-011-3)", () => {
    expect(
      resolveHomeDestination({
        groupIds: ["00000000-0000-4000-8000-000000000001"],
        view: "groups",
      }),
    ).toEqual({ kind: "list" });
  });

  it("view=groups以外の値や配列は無視して既定の判定に従う (AC-GRP-011-4)", () => {
    const groupIds = ["00000000-0000-4000-8000-000000000001"];
    for (const view of ["", "list", "GROUPS", "groups ", ["groups"], ["a"]]) {
      expect(resolveHomeDestination({ groupIds, view })).toEqual({
        kind: "group",
        href: "/groups/00000000-0000-4000-8000-000000000001",
      });
    }
  });

  it("直行先のgroupIDはURLへ安全にencodeする (AC-GRP-011-4)", () => {
    expect(
      resolveHomeDestination({ groupIds: ["a/b?c"], view: undefined }),
    ).toEqual({ kind: "group", href: "/groups/a%2Fb%3Fc" });
  });
});
