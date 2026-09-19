import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getAllowedGoogleUserId: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth/server", () => authMocks);

import { loadTransactionSaveFeedback } from "./load-transaction-save-feedback";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const TRANSACTION_ID = "20000000-0000-4000-8000-000000000001";
const USER_ID = "60000000-0000-4000-8000-000000000001";

type QueryResult = Readonly<{ data: unknown; error: unknown }>;

// tableごとの応答を返す最小のSupabase client mock（select/eq/maybeSingleを連鎖できる）
function setupSupabase(
  results: Readonly<Record<string, QueryResult>>,
  claims: unknown = { sub: USER_ID },
) {
  const from = vi.fn((table: string) => {
    const query = {
      select: vi.fn(() => query),
      eq: vi.fn(() => query),
      maybeSingle: vi.fn(
        async () => results[table] ?? { data: null, error: null },
      ),
    };
    return query;
  });
  authMocks.createServerSupabaseClient.mockResolvedValue({
    auth: {
      getClaims: vi.fn().mockResolvedValue({ data: { claims }, error: null }),
    },
    from,
  });
  authMocks.getAllowedGoogleUserId.mockImplementation((value) =>
    value && typeof value === "object" && "sub" in value ? USER_ID : null,
  );
  return { from };
}

describe("loadTransactionSaveFeedback (AC-TXN-019-3)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // グループのタイムゾーン（Asia/Tokyo）では2026-09-19、UTCでは2026-09-18の時刻
    vi.setSystemTime(new Date("2026-09-18T16:30:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.resetAllMocks();
  });

  it("保存済みの行とカテゴリ名・グループのタイムゾーンから通知内容を組み立てる", async () => {
    const { from } = setupSupabase({
      transactions: {
        data: {
          type: "expense",
          amount_minor: 1200,
          transaction_date: "2026-09-19",
          categories: { name: "食費" },
        },
        error: null,
      },
      groups: { data: { timezone: "Asia/Tokyo" }, error: null },
    });

    await expect(
      loadTransactionSaveFeedback({
        operation: "create",
        groupId: GROUP_ID,
        transactionId: TRANSACTION_ID,
        fallbackType: "expense",
      }),
    ).resolves.toEqual({
      title: "支出を登録しました",
      description: "9/19 食費 ￥1,200",
    });
    // 行の読み取りはgroup_idで絞り込み、RLSと二重に別グループを除外する
    const transactionsQuery = from.mock.results.find(
      (_result, index) => from.mock.calls[index]?.[0] === "transactions",
    )?.value;
    expect(transactionsQuery.eq).toHaveBeenCalledWith("id", TRANSACTION_ID);
    expect(transactionsQuery.eq).toHaveBeenCalledWith("group_id", GROUP_ID);
  });

  it("削除前の収入の行から削除の通知内容を組み立てる", async () => {
    setupSupabase({
      transactions: {
        data: {
          type: "income",
          amount_minor: 300000,
          transaction_date: "2025-12-25",
          categories: { name: "給与" },
        },
        error: null,
      },
      groups: { data: { timezone: "Asia/Tokyo" }, error: null },
    });

    await expect(
      loadTransactionSaveFeedback({
        operation: "delete",
        groupId: GROUP_ID,
        transactionId: TRANSACTION_ID,
      }),
    ).resolves.toEqual({
      title: "収入を削除しました",
      description: "2025/12/25 給与 ￥300,000",
    });
  });

  it("行を読めない場合は見出しだけを返し、失敗にしない", async () => {
    setupSupabase({
      transactions: { data: null, error: { code: "PGRST301" } },
      groups: { data: { timezone: "Asia/Tokyo" }, error: null },
    });

    await expect(
      loadTransactionSaveFeedback({
        operation: "update",
        groupId: GROUP_ID,
        transactionId: TRANSACTION_ID,
        fallbackType: "income",
      }),
    ).resolves.toEqual({ title: "収入を更新しました" });
  });

  it("不正なIDや未認証では問い合わせずに見出しだけを返す", async () => {
    const { from } = setupSupabase({}, null);

    await expect(
      loadTransactionSaveFeedback({
        operation: "delete",
        groupId: "not-a-uuid",
        transactionId: TRANSACTION_ID,
      }),
    ).resolves.toEqual({ title: "取引を削除しました" });
    await expect(
      loadTransactionSaveFeedback({
        operation: "create",
        groupId: GROUP_ID,
        transactionId: TRANSACTION_ID,
        fallbackType: "expense",
      }),
    ).resolves.toEqual({ title: "支出を登録しました" });
    expect(from).not.toHaveBeenCalled();
  });

  it("タイムゾーンを読めない場合はUTCの今日で年を判定する", async () => {
    setupSupabase({
      transactions: {
        data: {
          type: "expense",
          amount_minor: 500,
          transaction_date: "2026-09-19",
          categories: { name: "交通" },
        },
        error: null,
      },
      groups: { data: null, error: { code: "PGRST301" } },
    });

    await expect(
      loadTransactionSaveFeedback({
        operation: "create",
        groupId: GROUP_ID,
        transactionId: TRANSACTION_ID,
        fallbackType: "expense",
      }),
    ).resolves.toEqual({
      title: "支出を登録しました",
      description: "9/19 交通 ￥500",
    });
  });
});
