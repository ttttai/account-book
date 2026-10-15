import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getAllowedGoogleUserId: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/modules/auth/server", () => authMocks);

import {
  deleteAssetSnapshot,
  saveAssetSnapshot,
  setAssetCategoryArchived,
  updateAssetCategory,
} from "./asset-commands";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const CASH = "40000000-0000-4000-8000-000000000001";
const ME = "50000000-0000-4000-8000-000000000001";
const USER_ID = "60000000-0000-4000-8000-000000000001";

function setupSupabase(
  result: Readonly<{ data: unknown; error: { code?: unknown } | null }>,
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

const saveInput = {
  groupId: GROUP_ID,
  month: "2026-10",
  expectedVersion: null,
  values: [{ memberId: ME, categoryId: CASH, amountMinor: 1_200_000 }],
};

beforeEach(() => {
  vi.restoreAllMocks();
  authMocks.createServerSupabaseClient.mockReset();
  authMocks.getAllowedGoogleUserId.mockReset();
});

describe("saveAssetSnapshot", () => {
  it("記録月を月初日、値をDB関数の引数形へ変換して1回だけ呼ぶ (AST-002)", async () => {
    const { rpc } = setupSupabase({
      data: [{ outcome: "created", snapshot_version: 1 }],
      error: null,
    });
    expect(await saveAssetSnapshot(saveInput)).toEqual({ kind: "ok" });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("save_asset_snapshot", {
      p_group_id: GROUP_ID,
      p_month: "2026-10-01",
      p_expected_version: null,
      p_values: [
        { member_id: ME, asset_category_id: CASH, amount_minor: 1_200_000 },
      ],
    });
  });

  it("結果行のconflictを競合、unchangedを成功として扱う (AC-AST-005-1)", async () => {
    setupSupabase({
      data: [{ outcome: "conflict", snapshot_version: 2 }],
      error: null,
    });
    expect(await saveAssetSnapshot(saveInput)).toEqual({ kind: "conflict" });
    setupSupabase({
      data: [{ outcome: "unchanged", snapshot_version: 2 }],
      error: null,
    });
    expect(await saveAssetSnapshot(saveInput)).toEqual({ kind: "ok" });
  });

  it("SQLSTATEを権限不足・入力不正へ分類し、logには操作名とcodeだけを残す (NFR-OPS-008)", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    setupSupabase({ data: null, error: { code: "42501" } });
    expect(await saveAssetSnapshot(saveInput)).toEqual({ kind: "forbidden" });
    setupSupabase({ data: null, error: { code: "22023" } });
    expect(await saveAssetSnapshot(saveInput)).toEqual({ kind: "invalid" });
    expect(log).toHaveBeenLastCalledWith(
      "asset command failed: operation=saveAssetSnapshot code=22023",
    );
    expect(JSON.stringify(log.mock.calls)).not.toContain("1200000");
  });

  it("許可されていないsessionではDB関数を呼ばない", async () => {
    const { rpc } = setupSupabase({ data: null, error: null }, null);
    expect(await saveAssetSnapshot(saveInput)).toEqual({ kind: "forbidden" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("削除と資産区分のcommand", () => {
  it("削除はdeletedだけを成功にし、記録が無い・古いversionは競合 (AC-AST-004-2)", async () => {
    setupSupabase({ data: [{ outcome: "deleted" }], error: null });
    const input = { groupId: GROUP_ID, month: "2026-10", expectedVersion: 2 };
    expect(await deleteAssetSnapshot(input)).toEqual({ kind: "ok" });
    setupSupabase({ data: [{ outcome: "conflict" }], error: null });
    expect(await deleteAssetSnapshot(input)).toEqual({ kind: "conflict" });
  });

  it("資産区分名の重複は23505からduplicateへ分類する (AC-AST-006-2)", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    setupSupabase({ data: null, error: { code: "23505" } });
    expect(
      await updateAssetCategory({
        groupId: GROUP_ID,
        categoryId: CASH,
        expectedVersion: 1,
        name: "NISA",
        color: "sky",
      }),
    ).toEqual({ kind: "duplicate" });
  });

  it("アーカイブと復元は同じDB関数へ状態を渡す (AC-AST-006-1)", async () => {
    const { rpc } = setupSupabase({
      data: [{ outcome: "updated", category_version: 2 }],
      error: null,
    });
    expect(
      await setAssetCategoryArchived({
        groupId: GROUP_ID,
        categoryId: CASH,
        expectedVersion: 1,
        archived: false,
      }),
    ).toEqual({ kind: "ok" });
    expect(rpc).toHaveBeenCalledWith("set_asset_category_archived", {
      p_group_id: GROUP_ID,
      p_category_id: CASH,
      p_expected_version: 1,
      p_archived: false,
    });
  });
});
