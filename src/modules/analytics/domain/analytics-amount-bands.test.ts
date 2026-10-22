import { describe, expect, it } from "vitest";

import {
  ANALYTICS_AMOUNT_BANDS,
  aggregateAnalyticsAmountBands,
  findTopAnalyticsAmountBand,
  layoutAnalyticsAmountBands,
} from "./analytics-amount-bands";
import {
  aggregateAnalyticsMonth,
  type AnalyticsExpenseInput,
} from "./analytics-summary";

const MEMBER_A = "40000000-0000-4000-8000-00000000000a";
const MEMBER_B = "40000000-0000-4000-8000-00000000000b";

function expense(
  amountMinor: number,
  overrides: Partial<AnalyticsExpenseInput> = {},
): AnalyticsExpenseInput {
  return {
    date: "2026-09-10",
    amountMinor,
    payerMemberId: MEMBER_A,
    categoryId: "food",
    categoryName: "食費",
    categoryColor: "food",
    allocations: [{ memberId: MEMBER_A, amountMinor }],
    ...overrides,
  };
}

function countsOf(
  bands: ReturnType<typeof aggregateAnalyticsAmountBands>,
): number[] {
  return bands.map((band) => band.count);
}

describe("ANALYTICS_AMOUNT_BANDS", () => {
  it("小さい金額帯から固定の7帯を並べる (AC-ANA-018-1)", () => {
    expect(ANALYTICS_AMOUNT_BANDS.map((band) => band.label)).toEqual([
      "500円未満",
      "500〜1,000円",
      "1,000〜3,000円",
      "3,000〜5,000円",
      "5,000〜1万円",
      "1万〜3万円",
      "3万円以上",
    ]);
  });
});

describe("aggregateAnalyticsAmountBands", () => {
  it("下限を含み上限を含まない境界で振り分ける (AC-ANA-018-1)", () => {
    const amounts = [
      1, 499, 500, 999, 1000, 2999, 3000, 4999, 5000, 9999, 10000, 29999, 30000,
      1_000_000,
    ];
    const bands = aggregateAnalyticsAmountBands(
      ["2026-09"],
      amounts.map((amount) => expense(amount)),
      { scope: "group" },
    );

    expect(countsOf(bands)).toEqual([2, 2, 2, 2, 2, 2, 2]);
    expect(bands[0]?.amountMinor).toBe(500);
    expect(bands[6]?.amountMinor).toBe(1_030_000);
  });

  it("件数0の帯も残し、件数と金額の合計が期間の支出件数・支出と一致する (AC-ANA-018-1、AC-ANA-018-2)", () => {
    const expenses = [expense(6000), expense(6000), expense(120)];
    const bands = aggregateAnalyticsAmountBands(["2026-09"], expenses, {
      scope: "group",
    });
    const month = aggregateAnalyticsMonth("2026-09", expenses, [], {
      scope: "group",
    });

    expect(bands).toHaveLength(7);
    expect(countsOf(bands)).toEqual([1, 0, 0, 0, 2, 0, 0]);
    expect(bands.reduce((sum, band) => sum + band.amountMinor, 0)).toBe(
      month.expenseTotal,
    );
  });

  it("メンバー対象は負担額で振り分け、負担額0円の取引を数えない (AC-ANA-018-1)", () => {
    const expenses = [
      expense(6000, {
        allocations: [
          { memberId: MEMBER_A, amountMinor: 3000 },
          { memberId: MEMBER_B, amountMinor: 3000 },
        ],
      }),
      expense(800, { allocations: [{ memberId: MEMBER_B, amountMinor: 800 }] }),
    ];

    const memberA = aggregateAnalyticsAmountBands(["2026-09"], expenses, {
      scope: "member",
      memberId: MEMBER_A,
    });
    const group = aggregateAnalyticsAmountBands(["2026-09"], expenses, {
      scope: "group",
    });

    expect(countsOf(memberA)).toEqual([0, 0, 0, 1, 0, 0, 0]);
    expect(countsOf(group)).toEqual([0, 1, 0, 0, 1, 0, 0]);
  });

  it("期間外の取引を数えない", () => {
    const bands = aggregateAnalyticsAmountBands(
      ["2026-09"],
      [expense(100), expense(100, { date: "2026-10-01" })],
      { scope: "group" },
    );

    expect(countsOf(bands)).toEqual([1, 0, 0, 0, 0, 0, 0]);
  });
});

describe("layoutAnalyticsAmountBands", () => {
  const bands = aggregateAnalyticsAmountBands(
    ["2026-09"],
    [expense(100), expense(200), expense(300), expense(400), expense(45000)],
    { scope: "group" },
  );

  it("件数基準では全件数に対する構成比と、同じ意味の棒の長さを返す (AC-ANA-018-3)", () => {
    const rows = layoutAnalyticsAmountBands(bands, "count");

    expect(rows[0]).toMatchObject({
      count: 4,
      sharePercent: 80,
      barPercent: 80,
    });
    expect(rows[6]).toMatchObject({
      count: 1,
      sharePercent: 20,
      barPercent: 20,
    });
    expect(rows[1]).toMatchObject({ count: 0, sharePercent: 0, barPercent: 0 });
  });

  it("金額基準では期間支出に対する構成比と、最大の帯を満幅にしない棒の長さを返す (AC-ANA-018-3)", () => {
    const rows = layoutAnalyticsAmountBands(bands, "amount");

    // 45,000 / 46,000 = 97.8%。棒は四捨五入前の割合から求める
    expect(rows[6]).toMatchObject({
      amountMinor: 45000,
      sharePercent: 98,
      barPercent: 97.8,
    });
    // 小さい帯でも0でなければ棒が見える最小幅を持つ
    expect(rows[0]).toMatchObject({
      amountMinor: 1000,
      sharePercent: 2,
      barPercent: 2.2,
    });
    expect(rows[3]?.barPercent).toBe(0);
  });

  it("0でない帯の棒は最小幅を下回らない", () => {
    const tiny = aggregateAnalyticsAmountBands(
      ["2026-09"],
      [expense(100), expense(1_000_000)],
      { scope: "group" },
    );

    expect(layoutAnalyticsAmountBands(tiny, "amount")[0]?.barPercent).toBe(2);
  });

  it("全帯0件では0除算を起こさず、すべて0を返す", () => {
    const empty = aggregateAnalyticsAmountBands(["2026-09"], [], {
      scope: "group",
    });

    for (const basis of ["count", "amount"] as const) {
      for (const row of layoutAnalyticsAmountBands(empty, basis)) {
        expect(row).toMatchObject({ sharePercent: 0, barPercent: 0 });
      }
    }
  });
});

describe("findTopAnalyticsAmountBand", () => {
  it("選択中の基準で最も大きい帯を返す (AC-ANA-018-3)", () => {
    const bands = aggregateAnalyticsAmountBands(
      ["2026-09"],
      [expense(100), expense(200), expense(45000)],
      { scope: "group" },
    );

    expect(
      findTopAnalyticsAmountBand(
        layoutAnalyticsAmountBands(bands, "count"),
        "count",
      )?.label,
    ).toBe("500円未満");
    expect(
      findTopAnalyticsAmountBand(
        layoutAnalyticsAmountBands(bands, "amount"),
        "amount",
      )?.label,
    ).toBe("3万円以上");
  });

  it("同数の帯が複数あるときは小さい金額帯を返す (AC-ANA-018-3)", () => {
    const bands = aggregateAnalyticsAmountBands(
      ["2026-09"],
      [expense(100), expense(6000)],
      { scope: "group" },
    );

    expect(
      findTopAnalyticsAmountBand(
        layoutAnalyticsAmountBands(bands, "count"),
        "count",
      )?.label,
    ).toBe("500円未満");
  });

  it("全帯0件では帯を返さない", () => {
    const empty = aggregateAnalyticsAmountBands(["2026-09"], [], {
      scope: "group",
    });

    expect(
      findTopAnalyticsAmountBand(
        layoutAnalyticsAmountBands(empty, "count"),
        "count",
      ),
    ).toBeUndefined();
  });
});
