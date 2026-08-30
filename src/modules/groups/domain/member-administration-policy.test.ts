import { describe, expect, it } from "vitest";

import type { GroupMemberSummary } from "../application/member-types";
import {
  canAdministerMembers,
  getMemberRowActions,
  toMemberAdministrationTarget,
} from "./member-administration-policy";

describe("メンバー管理の権限判断 (AC-GRP-007-1, AC-GRP-008-1)", () => {
  it("ownerだけを管理者として扱う", () => {
    expect(canAdministerMembers("owner")).toBe(true);
  });

  it.each(["admin", "member", "", "OWNER", undefined, null, 0])(
    "owner以外 %s はfail closedで拒否する",
    (role) => {
      expect(canAdministerMembers(role)).toBe(false);
      expect(
        getMemberRowActions({
          currentRole: role,
          targetRole: "member",
          activeOwnerCount: 2,
        }),
      ).toEqual({ assignableRoles: [], canRemove: false });
    },
  );

  it("最後のアクティブownerには操作を提供しない (AC-GRP-010-3)", () => {
    expect(
      getMemberRowActions({
        currentRole: "owner",
        targetRole: "owner",
        activeOwnerCount: 1,
      }),
    ).toEqual({ assignableRoles: [], canRemove: false });
  });

  it("owner複数時はowner対象の降格を許し削除は許さない (AC-GRP-010-4)", () => {
    expect(
      getMemberRowActions({
        currentRole: "owner",
        targetRole: "owner",
        activeOwnerCount: 2,
      }),
    ).toEqual({ assignableRoles: ["admin", "member"], canRemove: false });
  });

  it("admin対象は昇格・降格と削除を提供する", () => {
    expect(
      getMemberRowActions({
        currentRole: "owner",
        targetRole: "admin",
        activeOwnerCount: 1,
      }),
    ).toEqual({ assignableRoles: ["owner", "member"], canRemove: true });
  });

  it("member対象は昇格と削除を提供する", () => {
    expect(
      getMemberRowActions({
        currentRole: "owner",
        targetRole: "member",
        activeOwnerCount: 1,
      }),
    ).toEqual({ assignableRoles: ["owner", "admin"], canRemove: true });
  });
});

describe("メンバー操作DTOの最小化 (NFR-SEC)", () => {
  it("client componentへ渡す対象DTOを3項目へ限定する", () => {
    const member: GroupMemberSummary = {
      membershipId: "33333333-3333-4333-8333-333333333333",
      displayName: "利用者A",
      role: "admin",
      joinedAt: "2026-08-01T00:00:00Z",
      isCurrentUser: true,
    };

    const target = toMemberAdministrationTarget(member);

    expect(target).toEqual({
      membershipId: member.membershipId,
      displayName: member.displayName,
      role: member.role,
    });
    expect(Object.keys(target).sort()).toEqual([
      "displayName",
      "membershipId",
      "role",
    ]);
  });
});
