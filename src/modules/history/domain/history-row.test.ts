import { describe, expect, it } from "vitest";

import {
  appendHistoryRows,
  compareHistoryRowSourcesDesc,
  toHistoryRow,
  type HistoryRow,
  type HistoryRowSource,
} from "./history-row";

function createSource(
  overrides: Partial<HistoryRowSource> & Pick<HistoryRowSource, "id">,
): HistoryRowSource {
  return {
    type: "expense",
    transactionDate: "2026-08-15",
    amountMinor: 1000,
    createdAt: "2026-08-15T10:00:00+00:00",
    payerMemberId: "00000000-0000-4000-8000-000000000021",
    recipientMemberId: null,
    memo: null,
    category: { name: "食費", color: "food", icon: "utensils" },
    allocations: [
      {
        memberId: "00000000-0000-4000-8000-000000000021",
        amountMinor: 1000,
      },
    ],
    ...overrides,
  };
}

const displayNames = new Map([
  ["00000000-0000-4000-8000-000000000021", "山田"],
  ["00000000-0000-4000-8000-000000000022", "佐藤"],
]);

describe("compareHistoryRowSourcesDesc", () => {
  it("取引日の新しい順、同日は作成日時の新しい順、同時刻はIDの降順に並べる", () => {
    const sources = [
      createSource({
        id: "00000000-0000-4000-8000-000000000101",
        transactionDate: "2026-08-14",
        createdAt: "2026-08-14T23:00:00+00:00",
      }),
      createSource({
        id: "00000000-0000-4000-8000-000000000102",
        transactionDate: "2026-08-15",
        createdAt: "2026-08-15T08:00:00+00:00",
      }),
      createSource({
        id: "00000000-0000-4000-8000-000000000103",
        transactionDate: "2026-08-15",
        createdAt: "2026-08-15T12:00:00+00:00",
      }),
      createSource({
        id: "00000000-0000-4000-8000-000000000104",
        transactionDate: "2026-08-15",
        createdAt: "2026-08-15T12:00:00+00:00",
      }),
    ];

    const sorted = [...sources].sort(compareHistoryRowSourcesDesc);

    expect(sorted.map((source) => source.id)).toEqual([
      "00000000-0000-4000-8000-000000000104",
      "00000000-0000-4000-8000-000000000103",
      "00000000-0000-4000-8000-000000000102",
      "00000000-0000-4000-8000-000000000101",
    ]);
  });
});

describe("toHistoryRow", () => {
  it("支出行を表示名解決済みの最小DTOへ変換する", () => {
    const row = toHistoryRow(
      createSource({
        id: "00000000-0000-4000-8000-000000000101",
        memo: "スーパー",
        allocations: [
          {
            memberId: "00000000-0000-4000-8000-000000000021",
            amountMinor: 600,
          },
          {
            memberId: "00000000-0000-4000-8000-000000000022",
            amountMinor: 400,
          },
        ],
      }),
      displayNames,
    );

    expect(row).toEqual({
      id: "00000000-0000-4000-8000-000000000101",
      type: "expense",
      transactionDate: "2026-08-15",
      amountMinor: 1000,
      categoryName: "食費",
      categoryColor: "food",
      categoryIcon: "utensils",
      partyDisplayName: "山田",
      memo: "スーパー",
      allocations: [
        {
          membershipId: "00000000-0000-4000-8000-000000000021",
          displayName: "山田",
          amountMinor: 600,
        },
        {
          membershipId: "00000000-0000-4000-8000-000000000022",
          displayName: "佐藤",
          amountMinor: 400,
        },
      ],
    });
  });

  it("createdAtや内部IDを表示用DTOへ含めない", () => {
    const row = toHistoryRow(
      createSource({ id: "00000000-0000-4000-8000-000000000101" }),
      displayNames,
    );

    expect(Object.keys(row).sort()).toEqual([
      "allocations",
      "amountMinor",
      "categoryColor",
      "categoryIcon",
      "categoryName",
      "id",
      "partyDisplayName",
      "transactionDate",
      "type",
    ]);
  });

  it("収入行は受取者を、未知のメンバーは既定名を表示する", () => {
    const row = toHistoryRow(
      createSource({
        id: "00000000-0000-4000-8000-000000000102",
        type: "income",
        payerMemberId: null,
        recipientMemberId: "00000000-0000-4000-8000-000000000099",
        allocations: [],
      }),
      displayNames,
    );

    expect(row.partyDisplayName).toBe("メンバー");
    expect(row.allocations).toEqual([]);
  });
});

describe("appendHistoryRows", () => {
  const rowA: HistoryRow = toHistoryRow(
    createSource({ id: "00000000-0000-4000-8000-000000000101" }),
    displayNames,
  );
  const rowB: HistoryRow = toHistoryRow(
    createSource({ id: "00000000-0000-4000-8000-000000000102" }),
    displayNames,
  );
  const rowC: HistoryRow = toHistoryRow(
    createSource({ id: "00000000-0000-4000-8000-000000000103" }),
    displayNames,
  );

  it("表示済みの行を維持したまま重複なく追記する", () => {
    const appended = appendHistoryRows([rowA, rowB], [rowB, rowC]);

    expect(appended.map((row) => row.id)).toEqual([rowA.id, rowB.id, rowC.id]);
  });

  it("追記対象が空でも表示済みの行を欠落させない", () => {
    expect(appendHistoryRows([rowA, rowB], [])).toEqual([rowA, rowB]);
  });
});
