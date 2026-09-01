import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getAllowedGoogleUserId: vi.fn(),
}));
const optionMocks = vi.hoisted(() => ({
  getExpenseFormOptions: vi.fn(),
}));

vi.mock("@/modules/auth/server", () => authMocks);
vi.mock("./get-expense-form-options", () => optionMocks);

import { getExpenseForEdit } from "./get-expense-for-edit";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const TRANSACTION_ID = "20000000-0000-4000-8000-000000000001";
const MEMBERSHIP_ID = "30000000-0000-4000-8000-000000000001";
const SECOND_MEMBERSHIP_ID = "30000000-0000-4000-8000-000000000002";
const USER_ID = "40000000-0000-4000-8000-000000000001";
const SECOND_USER_ID = "40000000-0000-4000-8000-000000000002";
const EXPENSE_CATEGORY_ID = "50000000-0000-4000-8000-000000000001";
const INCOME_CATEGORY_ID = "50000000-0000-4000-8000-000000000002";
const ARCHIVED_CATEGORY_ID = "50000000-0000-4000-8000-000000000003";

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

function listQuery(result: QueryResult) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValueOnce(query).mockResolvedValue(result);
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

const options = {
  group: {
    id: GROUP_ID,
    name: "共有家計",
    timezone: "Asia/Tokyo",
    defaultAllocation: "equal" as const,
    currentMembershipId: MEMBERSHIP_ID,
  },
  today: "2026-09-01",
  members: [
    {
      membershipId: MEMBERSHIP_ID,
      displayName: "自分",
      isCurrentUser: true,
    },
    {
      membershipId: SECOND_MEMBERSHIP_ID,
      displayName: "相手",
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
};

const expenseRow = {
  id: TRANSACTION_ID,
  type: "expense",
  amount_minor: 6000,
  transaction_date: "2026-09-01",
  category_id: EXPENSE_CATEGORY_ID,
  payer_member_id: MEMBERSHIP_ID,
  recipient_member_id: null,
  memo: "夕食",
  version: 3,
  deleted_at: null,
};

const incomeRow = {
  ...expenseRow,
  type: "income",
  amount_minor: 10000,
  category_id: INCOME_CATEGORY_ID,
  payer_member_id: null,
  recipient_member_id: MEMBERSHIP_ID,
  memo: "給与",
};

function setupTransactionQueries(
  transactionResult: QueryResult = { data: expenseRow, error: null },
  allocationResult: QueryResult = {
    data: [
      { member_id: MEMBERSHIP_ID, amount_minor: 3000 },
      { member_id: SECOND_MEMBERSHIP_ID, amount_minor: 3000 },
    ],
    error: null,
  },
) {
  const client = setupClient();
  client.from
    .mockReturnValueOnce(maybeSingleQuery(transactionResult))
    .mockReturnValueOnce(listQuery(allocationResult));
  return client;
}

describe("getExpenseForEdit", () => {
  beforeEach(() => {
    authMocks.createServerSupabaseClient.mockReset();
    authMocks.getAllowedGoogleUserId.mockReset();
    optionMocks.getExpenseFormOptions.mockReset();
    optionMocks.getExpenseFormOptions.mockResolvedValue(options);
  });

  it.each([
    ["invalid group", "invalid", TRANSACTION_ID],
    ["invalid transaction", GROUP_ID, "invalid"],
  ])("%s IDでは認証clientを作らない", async (_name, groupId, transactionId) => {
    await expect(getExpenseForEdit(groupId, transactionId)).resolves.toBeNull();
    expect(authMocks.createServerSupabaseClient).not.toHaveBeenCalled();
  });

  it("claims取得失敗ではフォーム選択肢を取得しない", async () => {
    const { getClaims, from } = setupClient();
    getClaims.mockResolvedValue({ data: null, error: { code: "invalid" } });

    await expect(
      getExpenseForEdit(GROUP_ID, TRANSACTION_ID),
    ).resolves.toBeNull();
    expect(optionMocks.getExpenseFormOptions).not.toHaveBeenCalled();
    expect(from).not.toHaveBeenCalled();
  });

  it("許可されたGoogle userが無ければ取引を取得しない", async () => {
    const { from } = setupClient();
    authMocks.getAllowedGoogleUserId.mockReturnValue(null);

    await expect(
      getExpenseForEdit(GROUP_ID, TRANSACTION_ID),
    ).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    ["missing options", null],
    ["missing expense categories", { ...options, categories: [] }],
  ])("%sでは取引を取得しない", async (_name, value) => {
    const { from } = setupClient();
    optionMocks.getExpenseFormOptions.mockResolvedValue(value);

    await expect(
      getExpenseForEdit(GROUP_ID, TRANSACTION_ID),
    ).resolves.toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it.each([
    [
      "transaction error",
      { data: null, error: { code: "XX000" } },
      { data: [], error: null },
    ],
    [
      "allocation error",
      { data: expenseRow, error: null },
      { data: null, error: { code: "XX000" } },
    ],
    [
      "missing transaction",
      { data: null, error: null },
      { data: [], error: null },
    ],
    [
      "deleted transaction",
      {
        data: { ...expenseRow, deleted_at: "2026-09-02T00:00:00Z" },
        error: null,
      },
      { data: [], error: null },
    ],
  ])(
    "%sでは編集データを返さない",
    async (_name, transactionResult, allocationResult) => {
      setupTransactionQueries(transactionResult, allocationResult);

      await expect(
        getExpenseForEdit(GROUP_ID, TRANSACTION_ID),
      ).resolves.toBeNull();
    },
  );

  it("activeな支払者と均等負担を支出編集DTOへ変換する", async () => {
    setupTransactionQueries();

    await expect(
      getExpenseForEdit(GROUP_ID, TRANSACTION_ID),
    ).resolves.toMatchObject({
      options,
      transaction: {
        type: "expense",
        id: TRANSACTION_ID,
        payerMemberId: MEMBERSHIP_ID,
        payerIsActive: true,
        payerDisplayName: "自分",
        allocationMethod: "equal",
        allocations: [
          { memberId: MEMBERSHIP_ID, amountMinor: 3000 },
          { memberId: SECOND_MEMBERSHIP_ID, amountMinor: 3000 },
        ],
      },
    });
  });

  it("activeな受取者を収入編集DTOへ変換する", async () => {
    setupTransactionQueries(
      { data: incomeRow, error: null },
      {
        data: [],
        error: null,
      },
    );

    await expect(
      getExpenseForEdit(GROUP_ID, TRANSACTION_ID),
    ).resolves.toMatchObject({
      transaction: {
        type: "income",
        recipientMemberId: MEMBERSHIP_ID,
        recipientIsActive: true,
        recipientDisplayName: "自分",
      },
    });
  });

  it.each([
    ["expense", { ...expenseRow, category_id: ARCHIVED_CATEGORY_ID }],
    ["income", { ...incomeRow, category_id: ARCHIVED_CATEGORY_ID }],
  ] as const)(
    "アーカイブ済み%sカテゴリを編集選択肢へ補う",
    async (_type, row) => {
      const { from } = setupTransactionQueries(
        { data: row, error: null },
        { data: [], error: null },
      );
      from.mockReturnValueOnce(
        maybeSingleQuery({
          data: {
            id: ARCHIVED_CATEGORY_ID,
            name: "旧カテゴリ",
            color: "other",
          },
          error: null,
        }),
      );

      await expect(
        getExpenseForEdit(GROUP_ID, TRANSACTION_ID),
      ).resolves.toMatchObject({
        transaction: {
          archivedCategory: {
            id: ARCHIVED_CATEGORY_ID,
            name: "旧カテゴリ",
            color: "other",
          },
        },
      });
    },
  );

  it.each([
    ["category error", { data: null, error: { code: "XX000" } }],
    ["missing category", { data: null, error: null }],
  ])(
    "%sではアーカイブカテゴリを補えないためnullを返す",
    async (_name, result) => {
      const { from } = setupTransactionQueries({
        data: { ...expenseRow, category_id: ARCHIVED_CATEGORY_ID },
        error: null,
      });
      from.mockReturnValueOnce(maybeSingleQuery(result));

      await expect(
        getExpenseForEdit(GROUP_ID, TRANSACTION_ID),
      ).resolves.toBeNull();
    },
  );

  it.each([
    ["income recipient", { ...incomeRow, recipient_member_id: null }],
    ["expense payer", { ...expenseRow, payer_member_id: null }],
  ] as const)("%s欠損を安全に拒否する", async (_name, row) => {
    setupTransactionQueries(
      { data: row, error: null },
      {
        data: [],
        error: null,
      },
    );

    await expect(
      getExpenseForEdit(GROUP_ID, TRANSACTION_ID),
    ).resolves.toBeNull();
  });

  it("削除済み受取者のプロフィール表示名を解決する", async () => {
    const removedIncome = {
      ...incomeRow,
      recipient_member_id: "30000000-0000-4000-8000-000000000099",
    };
    const { from } = setupTransactionQueries(
      { data: removedIncome, error: null },
      { data: [], error: null },
    );
    from
      .mockReturnValueOnce(
        maybeSingleQuery({
          data: {
            id: removedIncome.recipient_member_id,
            user_id: SECOND_USER_ID,
          },
          error: null,
        }),
      )
      .mockReturnValueOnce(
        maybeSingleQuery({
          data: { user_id: SECOND_USER_ID, display_name: "退会した相手" },
          error: null,
        }),
      );

    await expect(
      getExpenseForEdit(GROUP_ID, TRANSACTION_ID),
    ).resolves.toMatchObject({
      transaction: {
        type: "income",
        recipientIsActive: false,
        recipientDisplayName: "退会した相手",
      },
    });
  });

  it("削除済み支払者の情報欠損を固定表示名で補う", async () => {
    const removedExpense = {
      ...expenseRow,
      payer_member_id: "30000000-0000-4000-8000-000000000099",
    };
    const { from } = setupTransactionQueries({
      data: removedExpense,
      error: null,
    });
    from.mockReturnValueOnce(maybeSingleQuery({ data: null, error: null }));

    await expect(
      getExpenseForEdit(GROUP_ID, TRANSACTION_ID),
    ).resolves.toMatchObject({
      transaction: {
        type: "expense",
        payerIsActive: false,
        payerDisplayName: "削除済みメンバー",
      },
    });
  });
});
