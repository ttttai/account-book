import { describe, expect, it } from "vitest";

import { resolveEditReturnPath } from "./edit-return-path";

const groupId = "3f9f2f6a-1111-4222-8333-444455556666";

describe("resolveEditReturnPath", () => {
  it("同じグループのホーム・履歴への相対pathを許可する", () => {
    expect(resolveEditReturnPath(`/groups/${groupId}`, groupId)).toBe(
      `/groups/${groupId}`,
    );
    expect(
      resolveEditReturnPath(
        `/groups/${groupId}?month=2026-08&day=2026-08-15`,
        groupId,
      ),
    ).toBe(`/groups/${groupId}?month=2026-08&day=2026-08-15`);
    expect(
      resolveEditReturnPath(`/groups/${groupId}/history?month=2026-08`, groupId),
    ).toBe(`/groups/${groupId}/history?month=2026-08`);
  });

  it("別グループ・別origin・不正な値はグループホームへ倒す", () => {
    const fallback = `/groups/${groupId}`;
    expect(resolveEditReturnPath(undefined, groupId)).toBe(fallback);
    expect(resolveEditReturnPath("", groupId)).toBe(fallback);
    expect(resolveEditReturnPath("https://evil.example/", groupId)).toBe(
      fallback,
    );
    expect(resolveEditReturnPath("//evil.example/path", groupId)).toBe(
      fallback,
    );
    expect(
      resolveEditReturnPath(
        "/groups/00000000-0000-4000-8000-000000000000",
        groupId,
      ),
    ).toBe(fallback);
    expect(resolveEditReturnPath("/app", groupId)).toBe(fallback);
    expect(
      resolveEditReturnPath(`/groups/${groupId}/members`, groupId),
    ).toBe(fallback);
    expect(
      resolveEditReturnPath(`/groups/${groupId}?month=2026-08\nx`, groupId),
    ).toBe(fallback);
  });
});
