import { beforeEach, describe, expect, it, vi } from "vitest";

const authMocks = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  getAllowedGoogleUserId: vi.fn(),
}));
const tokenMocks = vi.hoisted(() => ({
  generateInvitationToken: vi.fn(),
}));

vi.mock("@/modules/auth/server", () => authMocks);
vi.mock("../infrastructure/generate-invitation-token", () => tokenMocks);

import { acceptInvitation } from "./accept-invitation";
import { changeMemberRole } from "./change-member-role";
import { createGroup } from "./create-group";
import { createInvitation } from "./create-invitation";
import { removeMember } from "./remove-member";
import { revokeInvitation } from "./revoke-invitation";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";
const MEMBERSHIP_ID = "20000000-0000-4000-8000-000000000001";
const INVITATION_ID = "30000000-0000-4000-8000-000000000001";
const USER_ID = "40000000-0000-4000-8000-000000000001";
const RAW_TOKEN = "a".repeat(43);

function setupSupabase() {
  const getClaims = vi.fn().mockResolvedValue({
    data: { claims: { sub: USER_ID } },
    error: null,
  });
  const rpc = vi.fn().mockResolvedValue({ data: null, error: null });
  authMocks.createServerSupabaseClient.mockResolvedValue({
    auth: { getClaims },
    rpc,
  });
  authMocks.getAllowedGoogleUserId.mockReturnValue(USER_ID);
  return { getClaims, rpc };
}

describe("group application commands", () => {
  beforeEach(() => {
    vi.unstubAllEnvs();
    authMocks.createServerSupabaseClient.mockReset();
    authMocks.getAllowedGoogleUserId.mockReset();
    tokenMocks.generateInvitationToken.mockReset();
    tokenMocks.generateInvitationToken.mockReturnValue(RAW_TOKEN);
  });

  it("グループ設定だけを作成RPCへ渡す", async () => {
    const { rpc } = setupSupabase();
    rpc.mockResolvedValue({ data: GROUP_ID, error: null });

    await expect(
      createGroup({
        name: "共有家計",
        weekStartsOn: 1,
        defaultAllocation: "equal",
      }),
    ).resolves.toBe(GROUP_ID);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("create_group", {
      p_name: "共有家計",
      p_week_starts_on: 1,
      p_default_allocation: "equal",
    });
  });

  it("認証できなければグループ作成RPCを呼ばない", async () => {
    const { rpc } = setupSupabase();
    authMocks.getAllowedGoogleUserId.mockReturnValue(null);

    await expect(
      createGroup({
        name: "共有家計",
        weekStartsOn: 1,
        defaultAllocation: "equal",
      }),
    ).rejects.toThrow("UNAUTHENTICATED");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("招待の生tokenをDBへ渡さずhashだけを保存する", async () => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", "https://example.test");
    const { rpc } = setupSupabase();
    rpc.mockResolvedValue({
      data: [
        {
          invitation_id: INVITATION_ID,
          expires_at: "2026-09-04T00:00:00Z",
        },
      ],
      error: null,
    });

    const result = await createInvitation({
      groupId: GROUP_ID,
      role: "member",
    });

    expect(result).toEqual({
      id: INVITATION_ID,
      role: "member",
      expiresAt: "2026-09-04T00:00:00Z",
      shareUrl: `https://example.test/invitations/accept#token=${RAW_TOKEN}`,
    });
    const rpcArguments = rpc.mock.calls[0]?.[1];
    expect(rpcArguments).toMatchObject({
      p_group_id: GROUP_ID,
      p_role: "member",
    });
    expect(rpcArguments.p_token_hash).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(rpcArguments)).not.toContain(RAW_TOKEN);
  });

  it("招待作成RPCの失敗を一般化して返す", async () => {
    const { rpc } = setupSupabase();
    rpc.mockResolvedValue({ data: null, error: { code: "42501" } });

    await expect(
      createInvitation({ groupId: GROUP_ID, role: "admin" }),
    ).rejects.toThrow("INVITATION_CREATE_FAILED");
  });

  it.each(["accepted", "already_accepted"] as const)(
    "招待受諾結果%sとgroup IDを返す",
    async (status) => {
      const { rpc } = setupSupabase();
      rpc.mockResolvedValue({
        data: [{ result: status, group_id: GROUP_ID }],
        error: null,
      });

      await expect(acceptInvitation({ token: RAW_TOKEN })).resolves.toEqual({
        status,
        groupId: GROUP_ID,
      });
      const rpcArguments = rpc.mock.calls[0]?.[1];
      expect(rpcArguments.p_token_hash).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(rpcArguments)).not.toContain(RAW_TOKEN);
    },
  );

  it.each(["not_found", "expired", "revoked", "used"] as const)(
    "招待不成立%sではgroup IDを返さない",
    async (status) => {
      const { rpc } = setupSupabase();
      rpc.mockResolvedValue({
        data: [{ result: status, group_id: null }],
        error: null,
      });

      await expect(acceptInvitation({ token: RAW_TOKEN })).resolves.toEqual({
        status,
      });
    },
  );

  it("参加成立なのにgroup IDが無ければ安全に失敗する", async () => {
    const { rpc } = setupSupabase();
    rpc.mockResolvedValue({
      data: [{ result: "accepted", group_id: null }],
      error: null,
    });

    await expect(acceptInvitation({ token: RAW_TOKEN })).rejects.toThrow(
      "INVITATION_ACCEPT_FAILED",
    );
  });

  it.each(["changed", "unchanged", "not_found", "last_owner"] as const)(
    "権限変更結果%sをそのまま返す",
    async (result) => {
      const { rpc } = setupSupabase();
      rpc.mockResolvedValue({ data: result, error: null });

      await expect(
        changeMemberRole({
          groupId: GROUP_ID,
          membershipId: MEMBERSHIP_ID,
          role: "admin",
        }),
      ).resolves.toBe(result);
      expect(rpc).toHaveBeenCalledExactlyOnceWith("change_group_member_role", {
        p_group_id: GROUP_ID,
        p_membership_id: MEMBERSHIP_ID,
        p_role: "admin",
      });
    },
  );

  it.each(["removed", "not_found", "owner_not_removable"] as const)(
    "メンバー削除結果%sをそのまま返す",
    async (result) => {
      const { rpc } = setupSupabase();
      rpc.mockResolvedValue({ data: result, error: null });

      await expect(
        removeMember({ groupId: GROUP_ID, membershipId: MEMBERSHIP_ID }),
      ).resolves.toBe(result);
    },
  );

  it.each([
    ["revoked", true],
    ["not_found", false],
  ] as const)("招待取消結果%sをboolean %sへ変換する", async (result, value) => {
    const { rpc } = setupSupabase();
    rpc.mockResolvedValue({ data: result, error: null });

    await expect(
      revokeInvitation({ groupId: GROUP_ID, invitationId: INVITATION_ID }),
    ).resolves.toBe(value);
    expect(rpc).toHaveBeenCalledExactlyOnceWith("revoke_group_invitation", {
      p_group_id: GROUP_ID,
      p_invitation_id: INVITATION_ID,
    });
  });
});
