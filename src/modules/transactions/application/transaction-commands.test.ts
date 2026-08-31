import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getAllowedGoogleUserId: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth/server", () => authMocks);

import { createExpense } from "./create-expense";
import { createIncome } from "./create-income";
import { deleteTransaction } from "./delete-transaction";
import { updateExpense } from "./update-expense";
import { updateIncome } from "./update-income";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const TRANSACTION_ID = "20000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "30000000-0000-4000-8000-000000000001";
const MEMBER_ID = "40000000-0000-4000-8000-000000000001";
const SECOND_MEMBER_ID = "40000000-0000-4000-8000-000000000002";
const REQUEST_ID = "50000000-0000-4000-8000-000000000001";
const USER_ID = "60000000-0000-4000-8000-000000000001";

const expenseInput = {
  groupId: GROUP_ID,
  amountMinor: 6001,
  transactionDate: "2026-09-01",
  categoryId: CATEGORY_ID,
  payerMemberId: MEMBER_ID,
  allocationMethod: "equal" as const,
  selectedMemberIds: [MEMBER_ID, SECOND_MEMBER_ID],
  customAllocations: [],
  memo: "夕食",
  clientRequestId: REQUEST_ID,
};

const incomeInput = {
  groupId: GROUP_ID,
  amountMinor: 300000,
  transactionDate: "2026-09-01",
  categoryId: CATEGORY_ID,
  recipientMemberId: MEMBER_ID,
  memo: "給与",
  clientRequestId: REQUEST_ID,
};

type RpcResult = Readonly<{
  data: unknown;
  error: Readonly<{ code?: unknown }> | null;
}>;

function setupSupabase(result: RpcResult = { data: null, error: null }) {
  const getClaims = vi.fn().mockResolvedValue({
    data: { claims: { sub: USER_ID } },
    error: null,
  });
  const rpc = vi.fn().mockResolvedValue(result);
  authMocks.createServerSupabaseClient.mockResolvedValue({
    auth: { getClaims },
    rpc,
  });
  authMocks.getAllowedGoogleUserId.mockReturnValue(USER_ID);
  return { getClaims, rpc };
}

describe("transaction application commands", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authMocks.createServerSupabaseClient.mockReset();
    authMocks.getAllowedGoogleUserId.mockReset();
  });

  describe("createExpense", () => {
    it("認証済み入力とサーバー計算済み負担額だけをRPCへ渡す", async () => {
      const { rpc } = setupSupabase({ data: TRANSACTION_ID, error: null });

      await expect(
        createExpense(expenseInput, [
          { memberId: MEMBER_ID, amountMinor: 3001 },
          { memberId: SECOND_MEMBER_ID, amountMinor: 3000 },
        ]),
      ).resolves.toBe(TRANSACTION_ID);

      expect(rpc).toHaveBeenCalledExactlyOnceWith(
        "create_expense_transaction",
        {
          p_group_id: GROUP_ID,
          p_amount_minor: 6001,
          p_transaction_date: "2026-09-01",
          p_category_id: CATEGORY_ID,
          p_payer_member_id: MEMBER_ID,
          p_memo: "夕食",
          p_client_request_id: REQUEST_ID,
          p_allocations: [
            { member_id: MEMBER_ID, amount_minor: 3001 },
            { member_id: SECOND_MEMBER_ID, amount_minor: 3000 },
          ],
        },
      );
    });

    it("許可されたGoogle sessionが無ければRPCを呼ばない", async () => {
      const { rpc } = setupSupabase();
      authMocks.getAllowedGoogleUserId.mockReturnValue(null);

      await expect(createExpense(expenseInput, [])).rejects.toThrow(
        "UNAUTHENTICATED",
      );
      expect(rpc).not.toHaveBeenCalled();
    });

    it("DB失敗を操作名と安全なcodeだけで記録する", async () => {
      setupSupabase({
        data: null,
        error: { code: "PGRST202\ntoken=secret" },
      });
      const errorLog = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(createExpense(expenseInput, [])).rejects.toThrow(
        "支出を登録できませんでした。",
      );

      expect(errorLog).toHaveBeenCalledExactlyOnceWith(
        "transaction command failed: operation=createExpense code=unknown",
      );
      expect(errorLog.mock.calls.flat().join(" ")).not.toContain("夕食");
      expect(errorLog.mock.calls.flat().join(" ")).not.toContain("secret");
    });
  });

  describe("createIncome", () => {
    it("収入の受取者を含む検証済み入力だけをRPCへ渡す", async () => {
      const { rpc } = setupSupabase({ data: TRANSACTION_ID, error: null });

      await expect(createIncome(incomeInput)).resolves.toBe(TRANSACTION_ID);
      expect(rpc).toHaveBeenCalledExactlyOnceWith("create_income_transaction", {
        p_group_id: GROUP_ID,
        p_amount_minor: 300000,
        p_transaction_date: "2026-09-01",
        p_category_id: CATEGORY_ID,
        p_recipient_member_id: MEMBER_ID,
        p_memo: "給与",
        p_client_request_id: REQUEST_ID,
      });
    });
  });

  describe("updateExpense", () => {
    const updateInput = {
      ...expenseInput,
      transactionId: TRANSACTION_ID,
      expectedVersion: 4,
    };

    it("楽観的lockのversionと負担額をRPCへ渡す", async () => {
      const { rpc } = setupSupabase();

      await expect(
        updateExpense(updateInput, [
          { memberId: MEMBER_ID, amountMinor: 6001 },
        ]),
      ).resolves.toEqual({ kind: "ok" });
      expect(rpc).toHaveBeenCalledExactlyOnceWith(
        "update_expense_transaction",
        {
          p_group_id: GROUP_ID,
          p_transaction_id: TRANSACTION_ID,
          p_expected_version: 4,
          p_amount_minor: 6001,
          p_transaction_date: "2026-09-01",
          p_category_id: CATEGORY_ID,
          p_payer_member_id: MEMBER_ID,
          p_memo: "夕食",
          p_allocations: [{ member_id: MEMBER_ID, amount_minor: 6001 }],
        },
      );
    });

    it.each([
      ["40001", "conflict"],
      ["P0002", "not_found"],
      ["22023", "invalid"],
      ["PGRST202", "error"],
    ] as const)("SQLSTATE %sを%sへ分類する", async (code, kind) => {
      setupSupabase({ data: null, error: { code } });
      vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(updateExpense(updateInput, [])).resolves.toEqual({ kind });
    });
  });

  describe("updateIncome", () => {
    it("収入種別を変更せず受取者とversionをRPCへ渡す", async () => {
      const { rpc } = setupSupabase();

      await expect(
        updateIncome({
          ...incomeInput,
          transactionId: TRANSACTION_ID,
          expectedVersion: 2,
        }),
      ).resolves.toEqual({ kind: "ok" });
      expect(rpc).toHaveBeenCalledExactlyOnceWith("update_income_transaction", {
        p_group_id: GROUP_ID,
        p_transaction_id: TRANSACTION_ID,
        p_expected_version: 2,
        p_amount_minor: 300000,
        p_transaction_date: "2026-09-01",
        p_category_id: CATEGORY_ID,
        p_recipient_member_id: MEMBER_ID,
        p_memo: "給与",
      });
    });
  });

  describe("deleteTransaction", () => {
    it("不正な入力では認証clientもRPCも作らない", async () => {
      const result = await deleteTransaction({
        groupId: "invalid",
        transactionId: TRANSACTION_ID,
        expectedVersion: 1,
      });

      expect(result).toEqual({ kind: "error" });
      expect(authMocks.createServerSupabaseClient).not.toHaveBeenCalled();
    });

    it("対象IDとversionだけを削除RPCへ渡す", async () => {
      const { rpc } = setupSupabase();

      await expect(
        deleteTransaction({
          groupId: GROUP_ID,
          transactionId: TRANSACTION_ID,
          expectedVersion: 3,
        }),
      ).resolves.toEqual({ kind: "ok" });
      expect(rpc).toHaveBeenCalledExactlyOnceWith("delete_transaction", {
        p_group_id: GROUP_ID,
        p_transaction_id: TRANSACTION_ID,
        p_expected_version: 3,
      });
    });

    it("認証失敗では削除RPCを呼ばない", async () => {
      const { getClaims, rpc } = setupSupabase();
      getClaims.mockResolvedValue({ data: null, error: { code: "invalid" } });

      await expect(
        deleteTransaction({
          groupId: GROUP_ID,
          transactionId: TRANSACTION_ID,
          expectedVersion: 3,
        }),
      ).resolves.toEqual({ kind: "error" });
      expect(rpc).not.toHaveBeenCalled();
    });
  });
});
