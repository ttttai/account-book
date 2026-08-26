import { describe, expect, it } from "vitest";

import {
  acceptInvitationSchema,
  createInvitationSchema,
  revokeInvitationSchema,
} from "./invitation-input";

const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const INVITATION_ID = "22222222-2222-4222-8222-222222222222";
const TOKEN = "A".repeat(43);

describe("グループ招待入力 (AC-GRP-004-1, AC-GRP-004-7, AC-GRP-004-9)", () => {
  it.each(["admin", "member"])("招待role %sを受け付ける", (role) => {
    expect(
      createInvitationSchema.safeParse({ groupId: GROUP_ID, role }).success,
    ).toBe(true);
  });

  it.each(["owner", "", "administrator"])(
    "招待できないrole %sを拒否する",
    (role) => {
      expect(
        createInvitationSchema.safeParse({ groupId: GROUP_ID, role }).success,
      ).toBe(false);
    },
  );

  it.each(["", "short", `${TOKEN}=`, "あ".repeat(43)])(
    "不正な生tokenを拒否する",
    (token) => {
      expect(acceptInvitationSchema.safeParse({ token }).success).toBe(false);
    },
  );

  it("43文字のbase64url tokenを受け付ける", () => {
    expect(acceptInvitationSchema.parse({ token: TOKEN })).toEqual({
      token: TOKEN,
    });
  });

  it("取消対象のgroup IDとinvitation IDを検証する", () => {
    expect(
      revokeInvitationSchema.parse({
        groupId: GROUP_ID,
        invitationId: INVITATION_ID,
      }),
    ).toEqual({ groupId: GROUP_ID, invitationId: INVITATION_ID });
    expect(
      revokeInvitationSchema.safeParse({
        groupId: "not-a-uuid",
        invitationId: INVITATION_ID,
      }).success,
    ).toBe(false);
  });
});
