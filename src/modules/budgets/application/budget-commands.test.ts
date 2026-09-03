import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getAllowedGoogleUserId: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth/server", () => authMocks);

import {
  logBudgetCommandFailure,
  mapBudgetCommandError,
} from "./budget-command-error";
import { disableGroupBudget, setGroupBudget } from "./save-group-budget";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const FOOD = "30000000-0000-4000-8000-000000000001";
const HOME = "30000000-0000-4000-8000-000000000002";
const USER_ID = "60000000-0000-4000-8000-000000000001";

const setInput = {
  groupId: GROUP_ID,
  effectiveMonth: "2026-09",
  expectedVersion: null,
  totalAmountMinor: 300000,
  categoryLimits: [
    { categoryId: FOOD, amountMinor: 60000 },
    { categoryId: HOME, amountMinor: 100000 },
  ],
};

type RpcResult = Readonly<{
  data: unknown;
  error: Readonly<{ code?: unknown }> | null;
}>;

function setupSupabase(
  result: RpcResult = { data: 1, error: null },
  userId: string | null = USER_ID,
) {
  const rpc = vi.fn().mockResolvedValue(result);
  authMocks.createServerSupabaseClient.mockResolvedValue({
    auth: {
      getClaims: vi
        .fn()
        .mockResolvedValue({ data: { claims: { sub: userId } }, error: null }),
    },
    rpc,
  });
  authMocks.getAllowedGoogleUserId.mockReturnValue(userId);
  return { rpc };
}

beforeEach(() => {
  vi.restoreAllMocks();
  authMocks.createServerSupabaseClient.mockReset();
  authMocks.getAllowedGoogleUserId.mockReset();
});

describe("setGroupBudget", () => {
  it("開始月を月初日、内訳をDB関数の引数形へ変換して1回だけ呼ぶ (AC-BUD-001-1)", async () => {
    const { rpc } = setupSupabase();

    const result = await setGroupBudget(setInput);

    expect(result).toEqual({ kind: "ok" });
    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("set_group_budget", {
      p_group_id: GROUP_ID,
      p_effective_month: "2026-09-01",
      p_expected_version: null,
      p_total_amount_minor: 300000,
      p_category_limits: [
        { category_id: FOOD, amount_minor: 60000 },
        { category_id: HOME, amount_minor: 100000 },
      ],
    });
  });

  it("既存改定の更新ではexpectedVersionを渡す (AC-BUD-009-1)", async () => {
    const { rpc } = setupSupabase();

    await setGroupBudget({
      ...setInput,
      expectedVersion: 4,
      categoryLimits: [],
    });

    expect(rpc).toHaveBeenCalledWith(
      "set_group_budget",
      expect.objectContaining({ p_expected_version: 4, p_category_limits: [] }),
    );
  });

  it("未認証・許可リスト外では権限不足を返し、DB関数を呼ばない", async () => {
    const { rpc } = setupSupabase({ data: null, error: null }, null);

    expect(await setGroupBudget(setInput)).toEqual({ kind: "forbidden" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("DB関数の失敗を分類して返す", async () => {
    const { rpc } = setupSupabase({ data: null, error: { code: "40001" } });
    expect(await setGroupBudget(setInput)).toEqual({ kind: "conflict" });
    expect(rpc).toHaveBeenCalledTimes(1);
  });
});

describe("disableGroupBudget", () => {
  it("停止改定のDB関数へ月初日とexpectedVersionを渡す (AC-BUD-006-1)", async () => {
    const { rpc } = setupSupabase();

    const result = await disableGroupBudget({
      groupId: GROUP_ID,
      effectiveMonth: "2026-11",
      expectedVersion: 2,
    });

    expect(result).toEqual({ kind: "ok" });
    expect(rpc).toHaveBeenCalledWith("disable_group_budget", {
      p_group_id: GROUP_ID,
      p_effective_month: "2026-11-01",
      p_expected_version: 2,
    });
  });
});

describe("mapBudgetCommandError", () => {
  it("SQLSTATEを画面向けの結果種別へ変換する（同月の同時作成も競合）", () => {
    expect(mapBudgetCommandError("40001")).toEqual({ kind: "conflict" });
    expect(mapBudgetCommandError("23505")).toEqual({ kind: "conflict" });
    expect(mapBudgetCommandError("P0002")).toEqual({ kind: "not_found" });
    expect(mapBudgetCommandError("42501")).toEqual({ kind: "forbidden" });
    expect(mapBudgetCommandError("28000")).toEqual({ kind: "forbidden" });
    expect(mapBudgetCommandError("22023")).toEqual({ kind: "invalid" });
    expect(mapBudgetCommandError("XX000")).toEqual({ kind: "error" });
    expect(mapBudgetCommandError(undefined)).toEqual({ kind: "error" });
  });
});

describe("logBudgetCommandFailure", () => {
  it("操作名とcodeだけをlogし、不正な文字列はunknownへ置き換える (NFR-OPS-008)", () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => {});

    logBudgetCommandFailure("setGroupBudget", "22023");
    logBudgetCommandFailure("setGroupBudget", "金額 300000\n注入");

    expect(error).toHaveBeenNthCalledWith(
      1,
      "budget command failed: operation=setGroupBudget code=22023",
    );
    expect(error).toHaveBeenNthCalledWith(
      2,
      "budget command failed: operation=setGroupBudget code=unknown",
    );
  });
});
