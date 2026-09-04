import { describe, expect, it } from "vitest";

import { resolveHomeDestination } from "./home-destination";

describe("resolveHomeDestination", () => {
  it("アクティブな所属が1件だけならそのグループの当月カレンダーへ直行する (AC-GRP-011-1)", () => {
    expect(
      resolveHomeDestination({
        groupIds: ["00000000-0000-4000-8000-000000000001"],
        defaultGroupId: null,
        view: undefined,
      }),
    ).toEqual({
      kind: "group",
      href: "/groups/00000000-0000-4000-8000-000000000001",
    });
  });

  it("所属が0件は作成画面、2件以上は一覧を表示し直行しない (AC-GRP-011-2)", () => {
    expect(
      resolveHomeDestination({
        groupIds: [],
        defaultGroupId: null,
        view: undefined,
      }),
    ).toEqual({
      kind: "list",
    });
    expect(
      resolveHomeDestination({
        groupIds: [
          "00000000-0000-4000-8000-000000000001",
          "00000000-0000-4000-8000-000000000002",
        ],
        defaultGroupId: null,
        view: undefined,
      }),
    ).toEqual({ kind: "list" });
  });

  it("view=groupsでは所属が1件でも一覧を表示する (AC-GRP-011-3)", () => {
    expect(
      resolveHomeDestination({
        groupIds: ["00000000-0000-4000-8000-000000000001"],
        defaultGroupId: null,
        view: "groups",
      }),
    ).toEqual({ kind: "list" });
  });

  it("view=groups以外の値や配列は無視して既定の判定に従う (AC-GRP-011-4)", () => {
    const groupIds = ["00000000-0000-4000-8000-000000000001"];
    for (const view of ["", "list", "GROUPS", "groups ", ["groups"], ["a"]]) {
      expect(
        resolveHomeDestination({ groupIds, defaultGroupId: null, view }),
      ).toEqual({
        kind: "group",
        href: "/groups/00000000-0000-4000-8000-000000000001",
      });
    }
  });

  it("直行先のgroupIDはURLへ安全にencodeする (AC-GRP-011-4)", () => {
    expect(
      resolveHomeDestination({
        groupIds: ["a/b?c"],
        defaultGroupId: null,
        view: undefined,
      }),
    ).toEqual({ kind: "group", href: "/groups/a%2Fb%3Fc" });
  });

  const FIRST = "00000000-0000-4000-8000-000000000001";
  const SECOND = "00000000-0000-4000-8000-000000000002";

  it("起動時に開くグループがアクティブ所属に含まれれば所属件数にかかわらず直行する (AC-GRP-012-3)", () => {
    expect(
      resolveHomeDestination({
        groupIds: [FIRST, SECOND],
        defaultGroupId: SECOND,
        view: undefined,
      }),
    ).toEqual({ kind: "group", href: `/groups/${SECOND}` });
    expect(
      resolveHomeDestination({
        groupIds: [FIRST],
        defaultGroupId: FIRST,
        view: undefined,
      }),
    ).toEqual({ kind: "group", href: `/groups/${FIRST}` });
  });

  it("view=groupsは起動時に開くグループより優先して一覧を表示する (AC-GRP-012-3)", () => {
    expect(
      resolveHomeDestination({
        groupIds: [FIRST, SECOND],
        defaultGroupId: SECOND,
        view: "groups",
      }),
    ).toEqual({ kind: "list" });
  });

  it("起動時に開くグループの所属を失っていれば所属件数の判定へ戻す (AC-GRP-012-4)", () => {
    const lost = "00000000-0000-4000-8000-000000000099";
    expect(
      resolveHomeDestination({
        groupIds: [FIRST, SECOND],
        defaultGroupId: lost,
        view: undefined,
      }),
    ).toEqual({ kind: "list" });
    expect(
      resolveHomeDestination({
        groupIds: [FIRST],
        defaultGroupId: lost,
        view: undefined,
      }),
    ).toEqual({ kind: "group", href: `/groups/${FIRST}` });
    expect(
      resolveHomeDestination({
        groupIds: [],
        defaultGroupId: lost,
        view: undefined,
      }),
    ).toEqual({ kind: "list" });
  });

  it("起動時に開くグループのIDもURLへ安全にencodeする (AC-GRP-012-4)", () => {
    expect(
      resolveHomeDestination({
        groupIds: ["a/b?c", FIRST],
        defaultGroupId: "a/b?c",
        view: undefined,
      }),
    ).toEqual({ kind: "group", href: "/groups/a%2Fb%3Fc" });
  });
});
