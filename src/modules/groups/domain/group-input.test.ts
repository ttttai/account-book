import { describe, expect, it } from "vitest";

import { createGroupSchema } from "./group-input";

describe("createGroupSchema", () => {
  it("グループ名をtrimして設定値を受け取る", () => {
    expect(
      createGroupSchema.parse({
        name: "  わが家  ",
        weekStartsOn: "1",
        defaultAllocation: "equal",
      }),
    ).toEqual({
      name: "わが家",
      weekStartsOn: 1,
      defaultAllocation: "equal",
    });
  });

  it.each(["", " ", "あ".repeat(51)])("不正なグループ名を拒否する", (name) => {
    expect(
      createGroupSchema.safeParse({
        name,
        weekStartsOn: "0",
        defaultAllocation: "self",
      }).success,
    ).toBe(false);
  });

  it.each([
    { weekStartsOn: "2", defaultAllocation: "equal" },
    { weekStartsOn: "0", defaultAllocation: "all" },
  ])("許可されていない設定値を拒否する", (invalidSettings) => {
    expect(
      createGroupSchema.safeParse({ name: "家計", ...invalidSettings }).success,
    ).toBe(false);
  });
});
