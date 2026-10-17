import { describe, expect, it } from "vitest";

import { formatAssetCommandFailureLog } from "./asset-command-log";
import {
  createAssetCategoryInputSchema,
  deleteAssetSnapshotInputSchema,
  saveAssetSnapshotInputSchema,
  setAssetCategoryArchivedInputSchema,
  updateAssetCategoryInputSchema,
} from "./asset-input";

const GROUP = "10000000-0000-4000-8000-000000000001";
const MEMBER = "50000000-0000-4000-8000-000000000001";
const CASH = "40000000-0000-4000-8000-000000000001";

describe("saveAssetSnapshotInputSchema", () => {
  const valid = {
    groupId: GROUP,
    month: "2026-10",
    expectedVersion: "",
    values: [{ memberId: MEMBER, categoryId: CASH, amountMinor: "1200000" }],
  };

  it("空のversionは新規作成、空欄の金額は0円にする (AC-AST-002-1)", () => {
    const result = saveAssetSnapshotInputSchema.parse({
      ...valid,
      values: [{ memberId: MEMBER, categoryId: CASH, amountMinor: "" }],
    });
    expect(result.expectedVersion).toBeNull();
    expect(result.values[0]?.amountMinor).toBe(0);
    expect(
      saveAssetSnapshotInputSchema.parse({ ...valid, expectedVersion: "3" })
        .expectedVersion,
    ).toBe(3);
  });

  it("負数・小数・区切り付き・安全な整数超えの金額を拒否する (AC-AST-002-3)", () => {
    for (const amountMinor of ["-1", "1.5", "1,000", "9007199254740992"]) {
      expect(
        saveAssetSnapshotInputSchema.safeParse({
          ...valid,
          values: [{ memberId: MEMBER, categoryId: CASH, amountMinor }],
        }).success,
      ).toBe(false);
    }
  });

  it("不正な記録月と2000-01より前を拒否する (AC-AST-002-2)", () => {
    for (const month of ["2026-13", "2026-1", "1999-12", ""]) {
      expect(
        saveAssetSnapshotInputSchema.safeParse({ ...valid, month }).success,
      ).toBe(false);
    }
    expect(
      saveAssetSnapshotInputSchema.safeParse({ ...valid, month: "2000-01" })
        .success,
    ).toBe(true);
  });

  it("同じメンバー・資産区分の重複を拒否する (AC-AST-002-3)", () => {
    const result = saveAssetSnapshotInputSchema.safeParse({
      ...valid,
      values: [...valid.values, ...valid.values],
    });
    expect(result.success).toBe(false);
  });
});

describe("資産記録の削除と資産区分の入力", () => {
  it("削除は既存記録のversionを必須にする (AC-AST-004-2)", () => {
    expect(
      deleteAssetSnapshotInputSchema.safeParse({
        groupId: GROUP,
        month: "2026-10",
        expectedVersion: "",
      }).success,
    ).toBe(false);
    expect(
      deleteAssetSnapshotInputSchema.parse({
        groupId: GROUP,
        month: "2026-10",
        expectedVersion: "2",
      }).expectedVersion,
    ).toBe(2);
  });

  it("資産区分名は前後空白を除いて1〜20文字、色は18色tokenに限る (AC-AST-006-2)", () => {
    expect(
      createAssetCategoryInputSchema.parse({
        groupId: GROUP,
        name: "  暗号資産  ",
        color: "rose",
      }).name,
    ).toBe("暗号資産");
    expect(
      createAssetCategoryInputSchema.safeParse({
        groupId: GROUP,
        name: "あ".repeat(21),
        color: "rose",
      }).success,
    ).toBe(false);
    expect(
      createAssetCategoryInputSchema.safeParse({
        groupId: GROUP,
        name: "   ",
        color: "rose",
      }).success,
    ).toBe(false);
    expect(
      updateAssetCategoryInputSchema.safeParse({
        groupId: GROUP,
        categoryId: CASH,
        expectedVersion: "1",
        name: "預金",
        color: "#ff0000",
      }).success,
    ).toBe(false);
    expect(
      setAssetCategoryArchivedInputSchema.parse({
        groupId: GROUP,
        categoryId: CASH,
        expectedVersion: "4",
        archived: false,
      }),
    ).toEqual({
      groupId: GROUP,
      categoryId: CASH,
      expectedVersion: 4,
      archived: false,
    });
  });
});

describe("formatAssetCommandFailureLog", () => {
  it("操作名とcodeだけを残し、不正な値はunknownにする (NFR-OPS-008)", () => {
    expect(formatAssetCommandFailureLog("saveAssetSnapshot", "42501")).toBe(
      "asset command failed: operation=saveAssetSnapshot code=42501",
    );
    expect(formatAssetCommandFailureLog("save\nx", "1200000 円")).toBe(
      "asset command failed: operation=unknown code=unknown",
    );
  });
});
