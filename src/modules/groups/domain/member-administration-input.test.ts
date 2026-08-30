import { describe, expect, it } from "vitest";

import {
  changeMemberRoleSchema,
  removeMemberSchema,
} from "./member-administration-input";

const GROUP_ID = "11111111-1111-4111-8111-111111111111";
const MEMBERSHIP_ID = "33333333-3333-4333-8333-333333333333";

describe("メンバー権限変更入力 (AC-GRP-007-2, AC-GRP-007-3)", () => {
  it.each(["owner", "admin", "member"])(
    "権限 %sへの変更を受け付ける",
    (role) => {
      expect(
        changeMemberRoleSchema.parse({
          groupId: GROUP_ID,
          membershipId: MEMBERSHIP_ID,
          role,
        }),
      ).toEqual({ groupId: GROUP_ID, membershipId: MEMBERSHIP_ID, role });
    },
  );

  it.each(["", "superuser", "OWNER", "owner ", "オーナー"])(
    "不正な権限文字列 %sを拒否する",
    (role) => {
      expect(
        changeMemberRoleSchema.safeParse({
          groupId: GROUP_ID,
          membershipId: MEMBERSHIP_ID,
          role,
        }).success,
      ).toBe(false);
    },
  );

  it.each([
    { groupId: "not-a-uuid", membershipId: MEMBERSHIP_ID },
    { groupId: GROUP_ID, membershipId: "not-a-uuid" },
    { groupId: GROUP_ID, membershipId: "" },
    { groupId: GROUP_ID },
  ])("不正なID入力を拒否する %#", (input) => {
    expect(
      changeMemberRoleSchema.safeParse({ ...input, role: "member" }).success,
    ).toBe(false);
  });
});

describe("メンバー削除入力 (AC-GRP-008-1)", () => {
  it("グループIDとmembership IDを検証する", () => {
    expect(
      removeMemberSchema.parse({
        groupId: GROUP_ID,
        membershipId: MEMBERSHIP_ID,
      }),
    ).toEqual({ groupId: GROUP_ID, membershipId: MEMBERSHIP_ID });
  });

  it.each([
    { groupId: "not-a-uuid", membershipId: MEMBERSHIP_ID },
    { groupId: GROUP_ID, membershipId: "1; drop table group_members" },
    { membershipId: MEMBERSHIP_ID },
  ])("不正な削除対象を拒否する %#", (input) => {
    expect(removeMemberSchema.safeParse(input).success).toBe(false);
  });
});
