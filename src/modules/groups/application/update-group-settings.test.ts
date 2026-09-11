import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getAllowedGoogleUserId: vi.fn(),
}));

vi.mock("@/modules/auth/server", () => authMocks);

import { updateGroupSettings } from "./update-group-settings";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const USER_ID = "40000000-0000-4000-8000-000000000001";

const input = {
  groupId: GROUP_ID,
  name: "共有家計",
  weekStartsOn: 1,
  defaultAllocation: "self",
  expectedVersion: 2,
} as const;

function setupSupabase() {
  const getClaims = vi.fn().mockResolvedValue({
    data: { claims: { sub: USER_ID } },
    error: null,
  });
  const rpc = vi.fn().mockResolvedValue({ data: 3, error: null });
  authMocks.createServerSupabaseClient.mockResolvedValue({
    auth: { getClaims },
    rpc,
  });
  authMocks.getAllowedGoogleUserId.mockReturnValue(USER_ID);
  return { getClaims, rpc };
}

describe("updateGroupSettings", () => {
  beforeEach(() => {
    authMocks.createServerSupabaseClient.mockReset();
    authMocks.getAllowedGoogleUserId.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("名称・週の開始曜日・分け方・versionだけをRPCへ渡し、新しいversionを返す (AC-GRP-013-2, AC-GRP-013-5)", async () => {
    const { rpc } = setupSupabase();

    await expect(updateGroupSettings(input)).resolves.toEqual({
      kind: "ok",
      version: 3,
    });
    expect(rpc).toHaveBeenCalledExactlyOnceWith("update_group_settings", {
      p_group_id: GROUP_ID,
      p_name: "共有家計",
      p_week_starts_on: 1,
      p_default_allocation: "self",
      p_expected_version: 2,
    });
    const rpcArguments = rpc.mock.calls[0]?.[1];
    expect(JSON.stringify(rpcArguments)).not.toMatch(/currency|timezone/);
  });

  it("認証できなければRPCを呼ばない (AC-GRP-013-4)", async () => {
    const { rpc } = setupSupabase();
    authMocks.getAllowedGoogleUserId.mockReturnValue(null);

    await expect(updateGroupSettings(input)).rejects.toThrow("UNAUTHENTICATED");
    expect(rpc).not.toHaveBeenCalled();
  });

  it.each([
    ["40001", "conflict"],
    ["42501", "forbidden"],
    ["22023", "invalid"],
    ["XX000", "error"],
    [undefined, "error"],
  ] as const)(
    "SQLSTATE %sを結果種別%sへ変換する (AC-GRP-013-4, AC-GRP-013-5)",
    async (code, kind) => {
      const { rpc } = setupSupabase();
      rpc.mockResolvedValue({
        data: null,
        error: code ? { code, message: "db failure" } : { message: "boom" },
      });

      await expect(updateGroupSettings(input)).resolves.toEqual({ kind });
    },
  );

  it("RPCの戻り値が整数でなければ失敗として扱う", async () => {
    const { rpc } = setupSupabase();
    rpc.mockResolvedValue({ data: "3", error: null });

    await expect(updateGroupSettings(input)).resolves.toEqual({
      kind: "error",
    });
  });
});
