import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getAllowedGoogleUserId: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth/server", () => authMocks);

import { getRecurringManagement } from "./get-recurring-management";
import { RECURRING_SELECT_COLUMNS } from "./recurring-row";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const OWNER_USER_ID = "60000000-0000-4000-8000-000000000001";
const MEMBER_USER_ID = "60000000-0000-4000-8000-000000000002";
const OWNER_MEMBERSHIP_ID = "40000000-0000-4000-8000-000000000001";
const MEMBER_MEMBERSHIP_ID = "40000000-0000-4000-8000-000000000002";
const RENT_ID = "20000000-0000-4000-8000-000000000001";
const SALARY_ID = "20000000-0000-4000-8000-000000000002";

type QueryResult = Readonly<{ data: unknown; error: unknown }>;

type Chain = Readonly<{
  select: (columns: string) => Chain;
  eq: () => Chain;
  is: () => Chain;
  in: () => Chain;
  order: () => Chain;
  maybeSingle: () => Promise<QueryResult>;
  then: <T>(onfulfilled: (value: QueryResult) => T) => Promise<T>;
}>;

// selectの連鎖を模したthenableを返す。テーブル名ごとに結果を差し替え、取得列を記録する
function chain(
  result: QueryResult,
  onSelect: (columns: string) => void = () => {},
): Chain {
  const self: Chain = {
    select: (columns) => {
      onSelect(columns);
      return self;
    },
    eq: () => self,
    is: () => self,
    in: () => self,
    order: () => self,
    maybeSingle: () => Promise.resolve(result),
    // biome-ignore lint/suspicious/noThenProperty: Supabaseのquery builderはawait可能なthenableであり、その挙動を模すために必要
    then: (onfulfilled) => Promise.resolve(result).then(onfulfilled),
  };
  return self;
}

const groupRow = { id: GROUP_ID, name: "わが家", timezone: "Asia/Tokyo" };

const membershipRows = [
  {
    id: OWNER_MEMBERSHIP_ID,
    user_id: OWNER_USER_ID,
    role: "owner",
    joined_at: "2026-01-01T00:00:00Z",
  },
  {
    id: MEMBER_MEMBERSHIP_ID,
    user_id: MEMBER_USER_ID,
    role: "member",
    joined_at: "2026-02-01T00:00:00Z",
  },
];

const profileRows = [
  { user_id: OWNER_USER_ID, display_name: "オーナー" },
  { user_id: MEMBER_USER_ID, display_name: "メンバーB" },
];

const categoryRows = [
  {
    id: "30000000-0000-4000-8000-000000000001",
    name: "住居",
    type: "expense",
    color: "home",
    sort_order: 0,
  },
  {
    id: "30000000-0000-4000-8000-000000000002",
    name: "給与",
    type: "income",
    color: "salary",
    sort_order: 0,
  },
];

// 終了済み（過去の終了月）を先頭に置き、継続中が先へ並ぶことを確認する
const recurringRows = [
  {
    id: SALARY_ID,
    type: "income",
    name: "給与",
    amount_minor: 300000,
    day_of_month: 25,
    start_month: "2026-01-01",
    end_month: "2026-02-01",
    version: 4,
    memo: null,
    payer_member_id: null,
    recipient_member_id: MEMBER_MEMBERSHIP_ID,
    categories: {
      id: "30000000-0000-4000-8000-000000000002",
      name: "給与",
      color: "salary",
      icon: "salary",
    },
    recurring_transaction_allocations: [],
  },
  {
    id: RENT_ID,
    type: "expense",
    name: "家賃",
    amount_minor: 100000,
    day_of_month: 27,
    start_month: "2026-01-01",
    end_month: null,
    version: 1,
    memo: "毎月の家賃",
    payer_member_id: OWNER_MEMBERSHIP_ID,
    recipient_member_id: null,
    categories: {
      id: "30000000-0000-4000-8000-000000000001",
      name: "住居",
      color: "home",
      icon: "home",
    },
    recurring_transaction_allocations: [
      { member_id: OWNER_MEMBERSHIP_ID, amount_minor: 60000 },
      { member_id: MEMBER_MEMBERSHIP_ID, amount_minor: 40000 },
    ],
  },
];

function setupSupabase(userId: string | null = OWNER_USER_ID) {
  const results: Record<string, QueryResult> = {
    groups: { data: groupRow, error: null },
    group_members: { data: membershipRows, error: null },
    profiles: { data: profileRows, error: null },
    categories: { data: categoryRows, error: null },
    recurring_transactions: { data: recurringRows, error: null },
  };
  const selects: Record<string, string[]> = {};
  const from = vi.fn((table: string) =>
    chain(results[table] ?? { data: [], error: null }, (columns) => {
      selects[table] = [...(selects[table] ?? []), columns];
    }),
  );
  authMocks.createServerSupabaseClient.mockResolvedValue({
    auth: {
      getClaims: vi
        .fn()
        .mockResolvedValue({ data: { claims: { sub: userId } }, error: null }),
    },
    from,
  });
  authMocks.getAllowedGoogleUserId.mockReturnValue(userId);
  return { from, results, selects };
}

describe("getRecurringManagement", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authMocks.createServerSupabaseClient.mockReset();
    authMocks.getAllowedGoogleUserId.mockReset();
  });

  it("owner/adminにはcanManageを立て、継続中を先に終了済みを末尾へ並べる", async () => {
    setupSupabase(OWNER_USER_ID);

    const view = await getRecurringManagement(GROUP_ID);

    expect(view?.canManage).toBe(true);
    expect(view?.group).toEqual({ id: GROUP_ID, name: "わが家" });
    expect(
      view?.recurringTransactions.map((recurring) => [
        recurring.name,
        recurring.isEnded,
      ]),
    ).toEqual([
      ["家賃", false],
      ["給与", true],
    ]);
  });

  it("負担者と当事者を表示名へ解決し、最小DTOだけを返す", async () => {
    setupSupabase(OWNER_USER_ID);

    const view = await getRecurringManagement(GROUP_ID);
    const rent = view?.recurringTransactions.find(
      (recurring) => recurring.id === RENT_ID,
    );
    const salary = view?.recurringTransactions.find(
      (recurring) => recurring.id === SALARY_ID,
    );

    expect(rent).toMatchObject({
      type: "expense",
      startMonth: "2026-01",
      endMonth: null,
      partyDisplayName: "オーナー",
      version: 1,
      memo: "毎月の家賃",
    });
    expect(rent?.allocations).toEqual([
      {
        membershipId: OWNER_MEMBERSHIP_ID,
        displayName: "オーナー",
        amountMinor: 60000,
      },
      {
        membershipId: MEMBER_MEMBERSHIP_ID,
        displayName: "メンバーB",
        amountMinor: 40000,
      },
    ]);
    // 収入は受取者を当事者として表示し、負担行を持たない
    expect(salary).toMatchObject({
      type: "income",
      partyDisplayName: "メンバーB",
      endMonth: "2026-02",
    });
    expect(salary?.allocations).toEqual([]);
  });

  it("memberにはcanManageを立てない (AC-REC-001-1)", async () => {
    setupSupabase(MEMBER_USER_ID);

    const view = await getRecurringManagement(GROUP_ID);

    expect(view?.canManage).toBe(false);
  });

  it("未認証・不正なgroupId・非メンバーはnullを返す", async () => {
    setupSupabase(null);
    expect(await getRecurringManagement(GROUP_ID)).toBeNull();

    setupSupabase(OWNER_USER_ID);
    expect(await getRecurringManagement("not-a-uuid")).toBeNull();

    // 認証済みだがこのグループのアクティブメンバーではない
    setupSupabase("60000000-0000-4000-8000-000000000009");
    expect(await getRecurringManagement(GROUP_ID)).toBeNull();
  });

  it("一覧queryは共通の取得列定義を使い、行検証schemaが要求するカテゴリidを含む (AC-REC-004-1)", async () => {
    const { selects } = setupSupabase(OWNER_USER_ID);

    await getRecurringManagement(GROUP_ID);

    // 画面ごとに取得列を書き分けると、1件以上ある本番で検証例外になる回帰を防ぐ
    expect(selects.recurring_transactions).toEqual([RECURRING_SELECT_COLUMNS]);
    expect(RECURRING_SELECT_COLUMNS).toContain(
      "categories!recurring_transactions_category_group_fk(id, name, color, icon)",
    );
  });

  it("取得に失敗したら例外にする", async () => {
    const { results } = setupSupabase(OWNER_USER_ID);
    results.recurring_transactions = {
      data: null,
      error: { code: "PGRST301" },
    };

    await expect(getRecurringManagement(GROUP_ID)).rejects.toThrow(
      "固定費を取得できませんでした。",
    );
  });
});
