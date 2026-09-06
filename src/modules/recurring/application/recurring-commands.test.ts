import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getAllowedGoogleUserId: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth/server", () => authMocks);

import {
  logRecurringCommandFailure,
  mapRecurringCommandError,
} from "./recurring-command-error";
import { listRecurringSchedules } from "./list-recurring-schedules";
import { toRecurringSchedule } from "./recurring-row";
import {
  createRecurringTransaction,
  endRecurringTransaction,
  updateRecurringTransaction,
} from "./save-recurring-transaction";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const RECURRING_ID = "20000000-0000-4000-8000-000000000001";
const CATEGORY_ID = "30000000-0000-4000-8000-000000000001";
const MEMBER_ID = "40000000-0000-4000-8000-000000000001";
const SECOND_MEMBER_ID = "40000000-0000-4000-8000-000000000002";
const USER_ID = "60000000-0000-4000-8000-000000000001";

const expenseInput = {
  groupId: GROUP_ID,
  type: "expense" as const,
  name: "家賃",
  amountMinor: 100000,
  dayOfMonth: 27,
  startMonth: "2026-09",
  endMonth: null,
  categoryId: CATEGORY_ID,
  partyMemberId: MEMBER_ID,
  allocationMethod: "custom" as const,
  selectedMemberIds: [MEMBER_ID, SECOND_MEMBER_ID],
  customAllocations: [],
  memo: "毎月の家賃",
};

const allocations = [
  { memberId: MEMBER_ID, amountMinor: 60000 },
  { memberId: SECOND_MEMBER_ID, amountMinor: 40000 },
];

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

describe("recurring application commands", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    authMocks.createServerSupabaseClient.mockReset();
    authMocks.getAllowedGoogleUserId.mockReset();
  });

  describe("createRecurringTransaction", () => {
    it("支出は支払者と負担額を、月は月初日へ変換して渡す", async () => {
      const { rpc } = setupSupabase();

      const result = await createRecurringTransaction(
        expenseInput,
        allocations,
      );

      expect(result).toEqual({ kind: "ok" });
      expect(rpc).toHaveBeenCalledWith("create_recurring_transaction", {
        p_group_id: GROUP_ID,
        p_type: "expense",
        p_name: "家賃",
        p_amount_minor: 100000,
        p_day_of_month: 27,
        p_start_month: "2026-09-01",
        p_end_month: null,
        p_category_id: CATEGORY_ID,
        p_payer_member_id: MEMBER_ID,
        p_recipient_member_id: null,
        p_memo: "毎月の家賃",
        p_allocations: [
          { member_id: MEMBER_ID, amount_minor: 60000 },
          { member_id: SECOND_MEMBER_ID, amount_minor: 40000 },
        ],
      });
    });

    it("収入は受取者だけを設定し、負担額を渡さない (REC-003)", async () => {
      const { rpc } = setupSupabase();

      await createRecurringTransaction(
        { ...expenseInput, type: "income", endMonth: "2027-03" },
        allocations,
      );

      expect(rpc).toHaveBeenCalledWith(
        "create_recurring_transaction",
        expect.objectContaining({
          p_type: "income",
          p_payer_member_id: null,
          p_recipient_member_id: MEMBER_ID,
          p_end_month: "2027-03-01",
          p_allocations: [],
        }),
      );
    });

    it("未認証ならRPCを呼ばずforbiddenを返す", async () => {
      const { rpc } = setupSupabase();
      authMocks.getAllowedGoogleUserId.mockReturnValue(null);

      const result = await createRecurringTransaction(expenseInput, []);

      expect(result).toEqual({ kind: "forbidden" });
      expect(rpc).not.toHaveBeenCalled();
    });

    it("DB失敗のcodeを結果種別へ変換する", async () => {
      setupSupabase({ data: null, error: { code: "42501" } });

      await expect(
        createRecurringTransaction(expenseInput, allocations),
      ).resolves.toEqual({ kind: "forbidden" });
    });
  });

  describe("updateRecurringTransaction", () => {
    it("対象IDとversionを添えて更新する (AC-REC-003-1)", async () => {
      const { rpc } = setupSupabase();

      const result = await updateRecurringTransaction(
        {
          ...expenseInput,
          recurringTransactionId: RECURRING_ID,
          expectedVersion: 3,
        },
        allocations,
      );

      expect(result).toEqual({ kind: "ok" });
      expect(rpc).toHaveBeenCalledWith(
        "update_recurring_transaction",
        expect.objectContaining({
          p_recurring_transaction_id: RECURRING_ID,
          p_expected_version: 3,
          p_start_month: "2026-09-01",
        }),
      );
    });

    it("version競合をconflictとして返す", async () => {
      setupSupabase({ data: null, error: { code: "40001" } });

      await expect(
        updateRecurringTransaction(
          {
            ...expenseInput,
            recurringTransactionId: RECURRING_ID,
            expectedVersion: 1,
          },
          allocations,
        ),
      ).resolves.toEqual({ kind: "conflict" });
    });
  });

  describe("endRecurringTransaction", () => {
    it("終了月を月初日へ変換して渡す (AC-REC-003-2)", async () => {
      const { rpc } = setupSupabase();

      const result = await endRecurringTransaction({
        groupId: GROUP_ID,
        recurringTransactionId: RECURRING_ID,
        expectedVersion: 2,
        endMonth: "2026-10",
      });

      expect(result).toEqual({ kind: "ok" });
      expect(rpc).toHaveBeenCalledWith("end_recurring_transaction", {
        p_group_id: GROUP_ID,
        p_recurring_transaction_id: RECURRING_ID,
        p_expected_version: 2,
        p_end_month: "2026-10-01",
      });
    });

    it("対象なしをnot_foundとして返す", async () => {
      setupSupabase({ data: null, error: { code: "P0002" } });

      await expect(
        endRecurringTransaction({
          groupId: GROUP_ID,
          recurringTransactionId: RECURRING_ID,
          expectedVersion: 2,
          endMonth: "2026-10",
        }),
      ).resolves.toEqual({ kind: "not_found" });
    });
  });

  describe("mapRecurringCommandError", () => {
    it("SQLSTATEを画面が区別できる種別へ変換する", () => {
      expect(mapRecurringCommandError("40001")).toEqual({ kind: "conflict" });
      expect(mapRecurringCommandError("P0002")).toEqual({ kind: "not_found" });
      expect(mapRecurringCommandError("42501")).toEqual({ kind: "forbidden" });
      expect(mapRecurringCommandError("28000")).toEqual({ kind: "forbidden" });
      expect(mapRecurringCommandError("22023")).toEqual({ kind: "invalid" });
      expect(mapRecurringCommandError("PGRST202")).toEqual({ kind: "error" });
      expect(mapRecurringCommandError(undefined)).toEqual({ kind: "error" });
    });
  });

  describe("logRecurringCommandFailure", () => {
    it("操作名とcodeだけをサーバーlogへ残す (NFR-OPS-008)", () => {
      const error = vi.spyOn(console, "error").mockImplementation(() => {});

      logRecurringCommandFailure("createRecurringTransaction", "42501");

      expect(error).toHaveBeenCalledWith(
        "recurring command failed: operation=createRecurringTransaction code=42501",
      );
    });
  });

  describe("listRecurringSchedules / toRecurringSchedule", () => {
    const row = {
      id: RECURRING_ID,
      type: "expense" as const,
      name: "家賃",
      amount_minor: 100000,
      day_of_month: 27,
      start_month: "2026-09-01",
      end_month: null,
      version: 1,
      memo: null,
      payer_member_id: MEMBER_ID,
      recipient_member_id: null,
      categories: {
        id: "30000000-0000-4000-8000-000000000001",
        name: "住居",
        color: "home",
        icon: "home",
      },
      recurring_transaction_allocations: [
        { member_id: MEMBER_ID, amount_minor: 100000 },
      ],
    };

    it("DB行を月がYYYY-MMのドメイン型へ変換する", () => {
      expect(toRecurringSchedule(row)).toMatchObject({
        id: RECURRING_ID,
        startMonth: "2026-09",
        endMonth: null,
        payerMemberId: MEMBER_ID,
        allocations: [{ memberId: MEMBER_ID, amountMinor: 100000 }],
      });
      expect(
        toRecurringSchedule({ ...row, end_month: "2026-12-01" }).endMonth,
      ).toBe("2026-12");
    });

    it("グループの固定費設定を取得する", async () => {
      const order2 = vi.fn().mockResolvedValue({ data: [row], error: null });
      const order1 = vi.fn().mockReturnValue({ order: order2 });
      const eq = vi.fn().mockReturnValue({ order: order1 });
      const select = vi.fn().mockReturnValue({ eq });
      const supabase = { from: vi.fn().mockReturnValue({ select }) };

      const schedules = await listRecurringSchedules(
        supabase as never,
        GROUP_ID,
      );

      expect(supabase.from).toHaveBeenCalledWith("recurring_transactions");
      expect(eq).toHaveBeenCalledWith("group_id", GROUP_ID);
      expect(schedules).toHaveLength(1);
      expect(schedules[0]?.startMonth).toBe("2026-09");
    });

    it("取得に失敗したら例外にする", async () => {
      const order2 = vi
        .fn()
        .mockResolvedValue({ data: null, error: { code: "PGRST301" } });
      const order1 = vi.fn().mockReturnValue({ order: order2 });
      const eq = vi.fn().mockReturnValue({ order: order1 });
      const select = vi.fn().mockReturnValue({ eq });
      const supabase = { from: vi.fn().mockReturnValue({ select }) };

      await expect(
        listRecurringSchedules(supabase as never, GROUP_ID),
      ).rejects.toThrow("固定費を取得できませんでした。");
    });
  });
});
