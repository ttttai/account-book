import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getAllowedGoogleUserId: vi.fn(),
}));

vi.mock("@/modules/auth/server", () => authMocks);

import { getCategoryManagement } from "./get-category-management";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "20000000-0000-4000-8000-000000000001";
const EXPENSE_CATEGORY_ID = "30000000-0000-4000-8000-000000000001";
const INCOME_CATEGORY_ID = "30000000-0000-4000-8000-000000000002";

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

function categoryQuery(result: QueryResult) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    is: vi.fn(),
    order: vi.fn().mockResolvedValue(result),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.is.mockReturnValue(query);
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

function setupInitialQueries(
  role: "owner" | "admin" | "member",
  categoryResult: QueryResult = { data: [], error: null },
) {
  const client = setupClient();
  client.from
    .mockReturnValueOnce(
      maybeSingleQuery({
        data: { id: GROUP_ID, name: "共有家計" },
        error: null,
      }),
    )
    .mockReturnValueOnce(maybeSingleQuery({ data: { role }, error: null }))
    .mockReturnValueOnce(categoryQuery(categoryResult));
  return client;
}

describe("getCategoryManagement", () => {
  beforeEach(() => {
    authMocks.createServerSupabaseClient.mockReset();
    authMocks.getAllowedGoogleUserId.mockReset();
  });

  it("不正なgroup IDでは認証clientを作らない", async () => {
    await expect(getCategoryManagement("invalid")).resolves.toBeNull();
    expect(authMocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("claims取得失敗ではqueryしない", async () => {
    const { getClaims, from } = setupClient();
    getClaims.mockResolvedValue({ data: null, error: { code: "invalid" } });

    await expect(getCategoryManagement(GROUP_ID)).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("許可されたGoogle userが無ければqueryしない", async () => {
    const { from } = setupClient();
    authMocks.getAllowedGoogleUserId.mockReturnValue(null);

    await expect(getCategoryManagement(GROUP_ID)).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    [
      "group error",
      { data: null, error: { code: "XX000" } },
      { data: { role: "owner" }, error: null },
    ],
    [
      "membership error",
      { data: { id: GROUP_ID, name: "共有家計" }, error: null },
      { data: null, error: { code: "XX000" } },
    ],
    [
      "missing group",
      { data: null, error: null },
      { data: { role: "owner" }, error: null },
    ],
    [
      "missing membership",
      { data: { id: GROUP_ID, name: "共有家計" }, error: null },
      { data: null, error: null },
    ],
  ])("%sではデータを返さない", async (_name, groupResult, membershipResult) => {
    const { from } = setupClient();
    from
      .mockReturnValueOnce(maybeSingleQuery(groupResult))
      .mockReturnValueOnce(maybeSingleQuery(membershipResult));

    await expect(getCategoryManagement(GROUP_ID)).resolves.toBeNull();
  });

  it("memberには権限不足だけを返してカテゴリを取得しない", async () => {
    const { from } = setupInitialQueries("member");

    await expect(getCategoryManagement(GROUP_ID)).resolves.toEqual({
      kind: "forbidden",
    });
    expect(from).toHaveBeenCalledTimes(2);
  });

  it.each(["owner", "admin"] as const)(
    "%sには支出・収入カテゴリを分けたDTOを返す",
    async (role) => {
      setupInitialQueries(role, {
        data: [
          {
            id: INCOME_CATEGORY_ID,
            name: "給与",
            type: "income",
            color: "income",
            sort_order: 0,
          },
          {
            id: EXPENSE_CATEGORY_ID,
            name: "食費",
            type: "expense",
            color: "food",
            sort_order: 0,
          },
        ],
        error: null,
      });

      await expect(getCategoryManagement(GROUP_ID)).resolves.toEqual({
        kind: "authorized",
        data: {
          group: { id: GROUP_ID, name: "共有家計" },
          currentRole: role,
          expenseCategories: [
            {
              id: EXPENSE_CATEGORY_ID,
              name: "食費",
              color: "food",
            },
          ],
          incomeCategories: [
            {
              id: INCOME_CATEGORY_ID,
              name: "給与",
              color: "income",
            },
          ],
        },
      });
    },
  );

  it("カテゴリ取得失敗を一般化した例外にする", async () => {
    setupInitialQueries("owner", {
      data: null,
      error: { code: "XX000" },
    });

    await expect(getCategoryManagement(GROUP_ID)).rejects.toThrow(
      "カテゴリ一覧を取得できませんでした。",
    );
  });
});
