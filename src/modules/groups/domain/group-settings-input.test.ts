import { describe, expect, it } from "vitest";

import { updateGroupSettingsSchema } from "./group-settings-input";

const GROUP_ID = "10000000-0000-4000-8000-000000000001";

const validInput = {
  groupId: GROUP_ID,
  name: "  共有家計  ",
  weekStartsOn: "1",
  defaultAllocation: "self",
  expectedVersion: "3",
};

describe("updateGroupSettingsSchema", () => {
  it("名称をtrimし、週の開始曜日とversionを数値へ変換する (AC-GRP-013-3)", () => {
    expect(updateGroupSettingsSchema.parse(validInput)).toEqual({
      groupId: GROUP_ID,
      name: "共有家計",
      weekStartsOn: 1,
      defaultAllocation: "self",
      expectedVersion: 3,
    });
  });

  it.each([
    ["空", ""],
    ["空白のみ", "   "],
    ["51文字", "あ".repeat(51)],
  ])("グループ名が%sなら拒否する (AC-GRP-013-3)", (_label, name) => {
    const result = updateGroupSettingsSchema.safeParse({
      ...validInput,
      name,
    });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.name?.length).toBeGreaterThan(
        0,
      );
    }
  });

  it("50文字のグループ名を受け付ける", () => {
    const result = updateGroupSettingsSchema.safeParse({
      ...validInput,
      name: "あ".repeat(50),
    });
    expect(result.success).toBe(true);
  });

  it.each(["2", "", "monday"])(
    "週の開始曜日%sは日曜・月曜以外として拒否する (AC-GRP-013-3)",
    (weekStartsOn) => {
      expect(
        updateGroupSettingsSchema.safeParse({ ...validInput, weekStartsOn })
          .success,
      ).toBe(false);
    },
  );

  it.each(["half", "", "EQUAL"])(
    "標準の分け方%sは均等・自分以外として拒否する (AC-GRP-013-3)",
    (defaultAllocation) => {
      expect(
        updateGroupSettingsSchema.safeParse({
          ...validInput,
          defaultAllocation,
        }).success,
      ).toBe(false);
    },
  );

  it.each(["0", "-1", "1.5", "", "abc"])(
    "versionが%sなら1以上の整数でないとして拒否する (AC-GRP-013-5)",
    (expectedVersion) => {
      expect(
        updateGroupSettingsSchema.safeParse({
          ...validInput,
          expectedVersion,
        }).success,
      ).toBe(false);
    },
  );

  it("groupIdはUUID以外を拒否する (AC-GRP-013-3)", () => {
    expect(
      updateGroupSettingsSchema.safeParse({
        ...validInput,
        groupId: "not-a-uuid",
      }).success,
    ).toBe(false);
  });

  it("通貨・タイムゾーンは入力として受け取らない (AC-GRP-013-2)", () => {
    const parsed = updateGroupSettingsSchema.parse({
      ...validInput,
      currency: "USD",
      timezone: "UTC",
    });
    expect(parsed).not.toHaveProperty("currency");
    expect(parsed).not.toHaveProperty("timezone");
  });
});
