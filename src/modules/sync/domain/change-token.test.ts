import { describe, expect, it } from "vitest";

import { buildChangeToken, type ChangeAggregate } from "./change-token";

const baseline: readonly ChangeAggregate[] = [
  {
    table: "transactions",
    rowCount: 12,
    latestUpdatedAt: "2026-09-04T01:02:03.000Z",
  },
  {
    table: "recurring_transactions",
    rowCount: 2,
    latestUpdatedAt: "2026-09-01T00:00:00.000Z",
  },
  { table: "categories", rowCount: 10, latestUpdatedAt: null },
];

describe("buildChangeToken", () => {
  it("同じ集約値からは同じ32桁の16進tokenを返す (AC-SYNC-003-2)", () => {
    const token = buildChangeToken(baseline);
    expect(token).toMatch(/^[0-9a-f]{32}$/);
    expect(
      buildChangeToken(baseline.map((aggregate) => ({ ...aggregate }))),
    ).toBe(token);
  });

  it("行数の変化（作成・物理削除）でtokenが変わる", () => {
    const deleted = baseline.map((aggregate) =>
      aggregate.table === "transactions"
        ? { ...aggregate, rowCount: 11 }
        : aggregate,
    );
    expect(buildChangeToken(deleted)).not.toBe(buildChangeToken(baseline));
  });

  it("updated_at最大値の変化（編集・終了）でtokenが変わる", () => {
    const edited = baseline.map((aggregate) =>
      aggregate.table === "recurring_transactions"
        ? { ...aggregate, latestUpdatedAt: "2026-09-04T02:00:00.000Z" }
        : aggregate,
    );
    expect(buildChangeToken(edited)).not.toBe(buildChangeToken(baseline));
  });

  it("空テーブル（null）と0件を区別し、tokenへ行数や時刻を含めない", () => {
    const token = buildChangeToken(baseline);
    expect(token).not.toContain("12");
    expect(token).not.toContain("2026");
    const withZeroRows = baseline.map((aggregate) =>
      aggregate.table === "categories"
        ? { ...aggregate, rowCount: 0 }
        : aggregate,
    );
    expect(buildChangeToken(withZeroRows)).not.toBe(token);
  });
});
