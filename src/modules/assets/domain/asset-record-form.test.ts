import { describe, expect, it } from "vitest";

import {
  assetCellKey,
  buildAssetRecordInitialValues,
  findAssetCopySource,
} from "./asset-record-form";

const CASH = "40000000-0000-4000-8000-000000000001";
const NISA = "40000000-0000-4000-8000-000000000002";
const NEW_CATEGORY = "40000000-0000-4000-8000-000000000009";
const ME = "50000000-0000-4000-8000-000000000001";
const NEW_MEMBER = "50000000-0000-4000-8000-000000000009";

const snapshots = [
  {
    month: "2026-08",
    values: [{ memberId: ME, categoryId: CASH, amountMinor: 900 }],
  },
  {
    month: "2026-06",
    values: [{ memberId: ME, categoryId: CASH, amountMinor: 700 }],
  },
  {
    month: "2026-09",
    values: [
      { memberId: ME, categoryId: CASH, amountMinor: 1_000 },
      { memberId: ME, categoryId: NISA, amountMinor: 2_000 },
    ],
  },
];

describe("findAssetCopySource", () => {
  it("記録月より前で最も新しい記録をコピー元にする (AC-AST-003-1)", () => {
    expect(findAssetCopySource(snapshots, "2026-10")?.month).toBe("2026-09");
    expect(findAssetCopySource(snapshots, "2026-08")?.month).toBe("2026-06");
    expect(findAssetCopySource(snapshots, "2026-06")).toBeNull();
  });
});

describe("buildAssetRecordInitialValues", () => {
  const cells = [
    { memberId: ME, categoryId: CASH },
    { memberId: ME, categoryId: NISA },
    { memberId: ME, categoryId: NEW_CATEGORY },
    { memberId: NEW_MEMBER, categoryId: CASH },
  ];

  it("記録がない月は直前の記録をコピーし、コピー元にない組み合わせは空欄にする (AC-AST-003-1)", () => {
    const initial = buildAssetRecordInitialValues(
      cells,
      null,
      findAssetCopySource(snapshots, "2026-10"),
    );
    expect(initial).toEqual({
      copiedFrom: "2026-09",
      values: {
        [assetCellKey(ME, CASH)]: "1000",
        [assetCellKey(ME, NISA)]: "2000",
        [assetCellKey(ME, NEW_CATEGORY)]: "",
        [assetCellKey(NEW_MEMBER, CASH)]: "",
      },
    });
  });

  it("既存記録があればその値を使い、コピーの案内を出さない (AC-AST-004-1)", () => {
    const initial = buildAssetRecordInitialValues(
      cells,
      snapshots[0] ?? null,
      snapshots[2] ?? null,
    );
    expect(initial.copiedFrom).toBeNull();
    expect(initial.values[assetCellKey(ME, CASH)]).toBe("900");
    expect(initial.values[assetCellKey(ME, NISA)]).toBe("");
  });

  it("コピー元もない最初の記録はすべて空欄 (AC-AST-003-1)", () => {
    const initial = buildAssetRecordInitialValues(cells, null, null);
    expect(initial.copiedFrom).toBeNull();
    expect(Object.values(initial.values).every((value) => value === "")).toBe(
      true,
    );
  });
});
