import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getAllowedGoogleUserId: vi.fn(),
}));

vi.mock("@/modules/auth/server", () => authMocks);

import { getExpenseFormOptions } from "./get-expense-form-options";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const MEMBERSHIP_ID = "20000000-0000-4000-8000-000000000001";
const SECOND_MEMBERSHIP_ID = "20000000-0000-4000-8000-000000000002";
const USER_ID = "30000000-0000-4000-8000-000000000001";
const SECOND_USER_ID = "30000000-0000-4000-8000-000000000002";
const EXPENSE_CATEGORY_ID = "40000000-0000-4000-8000-000000000001";
const INCOME_CATEGORY_ID = "40000000-0000-4000-8000-000000000002";

type QueryResult = Readonly<{ data: unknown; error: unknown }>;

function maybeSingleQuery(result: QueryResult) {
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

function categoryQuery(result: QueryResult) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
  query.order.mockReturnValueOnce(query).mockResolvedValue(result);
  return query;
}

function profileQuery(result: QueryResult) {
  const query = {
    select: vi.fn(),
    in: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  return query;
}

function setupClient() {
  const getClaims = vi.fn().mockResolvedValue({
    data: { claims: { sub: USER_ID } },
    error: null,
  });
  const from = vi.fn();
  authMocks.createServerSupabaseClient.mockResolvedValue({
    auth: { getClaims },
    from,
  });
  authMocks.getAllowedGoogleUserId.mockReturnValue(USER_ID);
  return { getClaims, from };
}

const groupRow = {
  id: GROUP_ID,
  name: "共有家計",
  timezone: "Asia/Tokyo",
  default_allocation: "equal",
};

const memberships = [
  {
    id: MEMBERSHIP_ID,
    user_id: USER_ID,
    joined_at: "2026-01-01T00:00:00Z",
  },
  {
    id: SECOND_MEMBERSHIP_ID,
    user_id: SECOND_USER_ID,
    joined_at: "2026-01-02T00:00:00Z",
  },
];

const categories = [
  {
    id: EXPENSE_CATEGORY_ID,
    name: "食費",
    type: "expense",
    color: "food",
    icon: "utensils",
    sort_order: 0,
  },
  {
    id: INCOME_CATEGORY_ID,
    name: "給与",
    type: "income",
    color: "income",
    icon: "wallet",
    sort_order: 0,
  },
];

function setupInitialQueries(
  groupResult: QueryResult = { data: groupRow, error: null },
  membershipResult: QueryResult = { data: memberships, error: null },
  categoryResult: QueryResult = { data: categories, error: null },
) {
  const client = setupClient();
  client.from
    .mockReturnValueOnce(maybeSingleQuery(groupResult))
    .mockReturnValueOnce(membershipQuery(membershipResult))
    .mockReturnValueOnce(categoryQuery(categoryResult));
  return client;
}

describe("getExpenseFormOptions", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T03:00:00Z"));
    authMocks.createServerSupabaseClient.mockReset();
    authMocks.getAllowedGoogleUserId.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("不正なgroup IDでは認証clientを作らない", async () => {
    await expect(getExpenseFormOptions("invalid")).resolves.toBeNull();
    expect(authMocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("claims取得失敗ではqueryしない", async () => {
    const { getClaims, from } = setupClient();
    getClaims.mockResolvedValue({ data: null, error: { code: "invalid" } });

    await expect(getExpenseFormOptions(GROUP_ID)).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("許可されたGoogle userが無ければqueryしない", async () => {
    const { from } = setupClient();
    authMocks.getAllowedGoogleUserId.mockReturnValue(null);

    await expect(getExpenseFormOptions(GROUP_ID)).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    [
      "group error",
      { data: null, error: { code: "XX000" } },
      { data: memberships, error: null },
      { data: categories, error: null },
    ],
    [
      "membership error",
      { data: groupRow, error: null },
      { data: null, error: { code: "XX000" } },
      { data: categories, error: null },
    ],
    [
      "category error",
      { data: groupRow, error: null },
      { data: memberships, error: null },
      { data: null, error: { code: "XX000" } },
    ],
    [
      "missing group",
      { data: null, error: null },
      { data: memberships, error: null },
      { data: categories, error: null },
    ],
  ])(
    "%sではフォーム情報を返さない",
    async (_name, groupResult, membershipResult, categoryResult) => {
      setupInitialQueries(groupResult, membershipResult, categoryResult);

      await expect(getExpenseFormOptions(GROUP_ID)).resolves.toBeNull();
    },
  );

  it("activeな自分の所属が無ければプロフィールを取得しない", async () => {
    const { from } = setupInitialQueries(
      undefined,
      { data: memberships.slice(1), error: null },
      undefined,
    );

    await expect(getExpenseFormOptions(GROUP_ID)).resolves.toBeNull();
    expect(from).toHaveBeenCalledTimes(3);
  });

  it("プロフィール取得失敗を一般化した例外にする", async () => {
    const { from } = setupInitialQueries();
    from.mockReturnValueOnce(
      profileQuery({ data: null, error: { code: "XX000" } }),
    );

    await expect(getExpenseFormOptions(GROUP_ID)).rejects.toThrow(
      "支出登録情報を取得できませんでした。",
    );
  });

  it("メンバーと支出・収入カテゴリを最小DTOへ変換する", async () => {
    const { from } = setupInitialQueries();
    from.mockReturnValueOnce(
      profileQuery({
        data: [{ user_id: USER_ID, display_name: "自分" }],
        error: null,
      }),
    );

    await expect(
      getExpenseFormOptions(GROUP_ID, "2026-09-15"),
    ).resolves.toEqual({
      group: {
        id: GROUP_ID,
        name: "共有家計",
        timezone: "Asia/Tokyo",
        defaultAllocation: "equal",
        currentMembershipId: MEMBERSHIP_ID,
      },
      today: "2026-09-15",
      members: [
        {
          membershipId: MEMBERSHIP_ID,
          displayName: "自分",
          isCurrentUser: true,
        },
        {
          membershipId: SECOND_MEMBERSHIP_ID,
          displayName: "メンバー",
          isCurrentUser: false,
        },
      ],
      categories: [
        {
          id: EXPENSE_CATEGORY_ID,
          name: "食費",
          color: "food",
          icon: "utensils",
        },
      ],
      incomeCategories: [
        {
          id: INCOME_CATEGORY_ID,
          name: "給与",
          color: "income",
          icon: "wallet",
        },
      ],
    });
  });
});
