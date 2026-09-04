import { describe, expect, it } from "vitest";

import { setDefaultGroupSchema } from "./default-group-input";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";

describe("setDefaultGroupSchema", () => {
  it("UUIDのgroupIdと設定・解除の種別だけを受け付ける (AC-GRP-012-2)", () => {
    expect(
      setDefaultGroupSchema.parse({ groupId: GROUP_ID, mode: "set" }),
    ).toEqual({ groupId: GROUP_ID, mode: "set" });
    expect(
      setDefaultGroupSchema.parse({ groupId: GROUP_ID, mode: "clear" }),
    ).toEqual({ groupId: GROUP_ID, mode: "clear" });
  });

  it.each([
    { groupId: "not-a-uuid", mode: "set" },
    { groupId: "", mode: "set" },
    { groupId: GROUP_ID, mode: "toggle" },
    { groupId: GROUP_ID, mode: "" },
  ])("不正な入力を拒否する: %o", (input) => {
    expect(setDefaultGroupSchema.safeParse(input).success).toBe(false);
  });
});
