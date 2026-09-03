import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getAllowedGoogleUserId: vi.fn(),
}));

vi.mock("@/modules/auth/server", () => authMocks);

import { getGroupChangeToken } from "./get-group-change-token";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const MEMBERSHIP_ID = "20000000-0000-4000-8000-000000000001";
const USER_ID = "30000000-0000-4000-8000-000000000001";

type QueryResult = Readonly<{
  data: unknown;
  error: unknown;
  count?: number | null;
}>;

function groupQuery(result: QueryResult) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

function membershipQuery(result: QueryResult) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  return query;
}

// 集約query: select(updated_at, count) → eq(group_id) → order → limit で解決する
function aggregateQuery(result: QueryResult) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    order: vi.fn(),
    limit: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order.mockReturnValue(query);
  return query;
}

type Aggregates = Readonly<
  Record<"transactions" | "recurring_transactions" | "categories", QueryResult>
>;

const groupRow = {
  id: GROUP_ID,
  name: "共有家計",
  timezone: "Asia/Tokyo",
  week_starts_on: 0,
};

const activeMembership = [
  { id: MEMBERSHIP_ID, user_id: USER_ID, status: "active" },
];

function aggregate(rowCount: number, latest: string | null): QueryResult {
  return {
    data: latest ? [{ updated_at: latest }] : [],
    error: null,
    count: rowCount,
  };
}

const baselineAggregates: Aggregates = {
  transactions: aggregate(5, "2026-09-04T01:00:00+00:00"),
  recurring_transactions: aggregate(1, "2026-09-01T00:00:00+00:00"),
  categories: aggregate(10, "2026-08-24T00:00:00+00:00"),
};

function setup(
  options: Readonly<{
    userId?: string | null;
    memberships?: readonly unknown[];
    aggregates?: Aggregates;
  }> = {},
) {
  const getClaims = vi.fn().mockResolvedValue({
    data: { claims: { sub: options.userId ?? USER_ID } },
    error: null,
  });
  const tables = new Map<string, ReturnType<typeof aggregateQuery>>();
  const from = vi.fn((table: string) => {
    if (table === "groups") return groupQuery({ data: groupRow, error: null });
    if (table === "group_members") {
      return membershipQuery({
        data: options.memberships ?? activeMembership,
        error: null,
      });
    }
    const aggregates = options.aggregates ?? baselineAggregates;
    const query = aggregateQuery(
      aggregates[table as keyof Aggregates] ?? { data: [], error: null },
    );
    tables.set(table, query);
    return query;
  });
  authMocks.createServerSupabaseClient.mockResolvedValue({
    auth: { getClaims },
    from,
  });
  authMocks.getAllowedGoogleUserId.mockReturnValue(
    options.userId === null ? undefined : (options.userId ?? USER_ID),
  );
  return { from, tables, getClaims };
}

beforeEach(() => {
  authMocks.createServerSupabaseClient.mockReset();
  authMocks.getAllowedGoogleUserId.mockReset();
});

afterEach(() => vi.restoreAllMocks());

describe("getGroupChangeToken", () => {
  it("アクティブメンバーへ3テーブルの集約だけから作った不透明tokenを返す (SYNC-003, NFR-PERF-007)", async () => {
    const { from, tables } = setup();

    const result = await getGroupChangeToken(GROUP_ID);

    expect(result.kind).toBe("ready");
    if (result.kind !== "ready") throw new Error("unexpected result");
    expect(result.token).toMatch(/^[0-9a-f]{32}$/);
    expect(result.token).not.toContain("2026");

    const queriedTables = from.mock.calls.map(([table]) => table);
    expect(queriedTables).toEqual(
      expect.arrayContaining([
        "transactions",
        "recurring_transactions",
        "categories",
      ]),
    );
    for (const table of [
      "transactions",
      "recurring_transactions",
      "categories",
    ]) {
      const query = tables.get(table);
      expect(query, table).toBeDefined();
      // 取引行の本体を読まず、updated_atと件数だけを要求する
      expect(query?.select).toHaveBeenCalledWith("updated_at", {
        count: "exact",
      });
      expect(query?.eq).toHaveBeenCalledWith("group_id", GROUP_ID);
      expect(query?.order).toHaveBeenCalledWith("updated_at", {
        ascending: false,
      });
      expect(query?.limit).toHaveBeenCalledWith(1);
    }
  });

  it("行数またはupdated_atが変わるとtokenが変わり、同じならtokenも同じ (AC-SYNC-003-2)", async () => {
    setup();
    const first = await getGroupChangeToken(GROUP_ID);
    setup();
    const same = await getGroupChangeToken(GROUP_ID);
    setup({
      aggregates: {
        ...baselineAggregates,
        transactions: aggregate(4, "2026-09-04T01:00:00+00:00"),
      },
    });
    const afterDelete = await getGroupChangeToken(GROUP_ID);
    setup({
      aggregates: {
        ...baselineAggregates,
        transactions: aggregate(5, "2026-09-04T02:00:00+00:00"),
      },
    });
    const afterEdit = await getGroupChangeToken(GROUP_ID);
    setup({
      aggregates: {
        ...baselineAggregates,
        categories: aggregate(11, "2026-09-04T03:00:00+00:00"),
      },
    });
    const afterCategory = await getGroupChangeToken(GROUP_ID);

    const tokens = [first, same, afterDelete, afterEdit, afterCategory].map(
      (result) => (result.kind === "ready" ? result.token : result.kind),
    );
    expect(tokens[0]).toBe(tokens[1]);
    expect(new Set(tokens.slice(1)).size).toBe(4);
  });

  it("未認証にはunauthenticatedを返し、グループ所有データを読まない (AC-SYNC-003-1)", async () => {
    const { from } = setup({ userId: null });

    const result = await getGroupChangeToken(GROUP_ID);

    expect(result).toEqual({ kind: "unauthenticated" });
    expect(from).not.toHaveBeenCalledWith("transactions");
    expect(from).not.toHaveBeenCalledWith("recurring_transactions");
    expect(from).not.toHaveBeenCalledWith("categories");
  });

  it("非メンバーにはnot_foundを返し、存在もtokenも明かさない (AC-SYNC-003-1)", async () => {
    const { from } = setup({ memberships: [] });

    const result = await getGroupChangeToken(GROUP_ID);

    expect(result).toEqual({ kind: "not_found" });
    expect(from).not.toHaveBeenCalledWith("transactions");
  });

  it("不正なgroupIdにはDBを読まずnot_foundを返す (AC-SYNC-003-1)", async () => {
    const { from } = setup();

    const result = await getGroupChangeToken("not-a-uuid");

    expect(result).toEqual({ kind: "not_found" });
    expect(from).not.toHaveBeenCalled();
  });

  it("集約queryが失敗したら例外にし、部分的なtokenを返さない", async () => {
    setup({
      aggregates: {
        ...baselineAggregates,
        transactions: { data: null, error: { message: "boom" }, count: null },
      },
    });

    await expect(getGroupChangeToken(GROUP_ID)).rejects.toThrow(
      "変更を確認できませんでした。",
    );
  });
});
