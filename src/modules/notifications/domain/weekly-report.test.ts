import { describe, expect, it } from "vitest";

import type { WeeklyReportPeriod } from "./report-period";
import type { ReportExpenseRow, WeeklyReportSource } from "./report-source";
import {
  buildWeeklyReport,
  estimateMonthEndExpense,
  formatUsageBar,
  formatWeeklyReportMessage,
} from "./weekly-report";

const FOOD = "30000000-0000-4000-8000-000000000001";
const DAILY = "30000000-0000-4000-8000-000000000002";
const TRANSPORT = "30000000-0000-4000-8000-000000000003";
const FUN = "30000000-0000-4000-8000-000000000004";
const MEDICAL = "30000000-0000-4000-8000-000000000005";
const CLOTHES = "30000000-0000-4000-8000-000000000006";
const OTHER = "30000000-0000-4000-8000-000000000007";
const HOME = "30000000-0000-4000-8000-000000000008";
const MEMBER_A = "40000000-0000-4000-8000-000000000001";
const MEMBER_B = "40000000-0000-4000-8000-000000000002";

const period: WeeklyReportPeriod = {
  week: { start: "2026-08-31", end: "2026-09-06" },
  previousWeek: { start: "2026-08-24", end: "2026-08-30" },
  month: "2026-09",
  months: ["2026-08", "2026-09"],
  monthToDate: { start: "2026-09-01", end: "2026-09-06" },
  elapsedDays: 6,
  daysInMonth: 30,
  previousMonthToDate: { start: "2026-08-01", end: "2026-08-06" },
};

const members = [
  { id: MEMBER_A, displayName: "たいし" },
  { id: MEMBER_B, displayName: "かこ" },
];

// 60:40で負担する支出行
function expenseRow(
  date: string,
  amountMinor: number,
  categoryId: string,
  categoryName: string,
  shareA: number,
): ReportExpenseRow {
  return {
    date,
    amountMinor,
    categoryId,
    categoryName,
    categoryColor: "token",
    payerMemberId: MEMBER_A,
    allocations: [
      { memberId: MEMBER_A, amountMinor: shareA },
      { memberId: MEMBER_B, amountMinor: amountMinor - shareA },
    ],
  };
}

const source: WeeklyReportSource = {
  expenses: [
    // 対象週（8/31〜9/6）
    expenseRow("2026-08-31", 18200, FOOD, "食費", 10920),
    expenseRow("2026-09-01", 8360, DAILY, "日用品", 5016),
    expenseRow("2026-09-02", 5000, TRANSPORT, "交通", 3000),
    expenseRow("2026-09-03", 3000, FUN, "娯楽", 1800),
    expenseRow("2026-09-04", 1500, MEDICAL, "医療", 900),
    expenseRow("2026-09-05", 900, CLOTHES, "衣服", 540),
    expenseRow("2026-09-06", 100, OTHER, "その他", 60),
    // 前週（8/24〜8/30）
    expenseRow("2026-08-24", 30000, FOOD, "食費", 18000),
    expenseRow("2026-08-30", 11200, DAILY, "日用品", 6720),
    // 先月の同時点（8/1〜8/6）
    expenseRow("2026-08-03", 12300, FOOD, "食費", 7380),
    // 対象月だが累計の外（9/6より後）
    expenseRow("2026-09-20", 2000, FOOD, "食費", 1200),
  ],
  incomes: [{ date: "2026-09-01", amountMinor: 300000 }],
  recurring: [
    {
      id: "60000000-0000-4000-8000-000000000001",
      type: "expense",
      amountMinor: 80000,
      dayOfMonth: 25,
      // 9月から開始するため、前週(8/24〜8/30)と先月の同時点には展開されない
      startMonth: "2026-09",
      endMonth: null,
      categoryId: HOME,
      categoryName: "住居",
      categoryColor: "home",
      payerMemberId: MEMBER_B,
      allocations: [
        { memberId: MEMBER_A, amountMinor: 48000 },
        { memberId: MEMBER_B, amountMinor: 32000 },
      ],
    },
  ],
  budget: {
    effectiveMonth: "2026-09",
    status: "active",
    totalAmountMinor: 300000,
    version: 1,
    categoryLimits: [
      {
        categoryId: FOOD,
        categoryName: "食費",
        categoryColor: "food",
        amountMinor: 20000,
      },
      {
        categoryId: HOME,
        categoryName: "住居",
        categoryColor: "home",
        amountMinor: 80000,
      },
      {
        categoryId: DAILY,
        categoryName: "日用品",
        categoryColor: "daily",
        amountMinor: 30000,
      },
    ],
  },
  members,
};

describe("buildWeeklyReport", () => {
  it("対象週・メンバー別・累計・見込み・予算進捗を画面と同じ純関数で組み立てる (AC-NOTIF-003-1, AC-NOTIF-003-2)", () => {
    const report = buildWeeklyReport("わが家", period, source);

    expect(report.groupName).toBe("わが家");
    expect(report.week.range).toEqual(period.week);
    // 対象週の支出は単発7件（固定費の25日は週の外）
    expect(report.week.expenseTotal).toBe(37060);
    expect(report.week.expenseCount).toBe(7);
    // 先週比は差額だけで、比率は持たない (ANA-003)
    expect(report.week.comparison).toEqual({ diffMinor: 37060 - 41200 });
    // カテゴリ行は前週の同じカテゴリとの差額を持つ
    expect(report.week.categories).toEqual([
      { name: "食費", amountMinor: 18200, diffMinor: -11800 },
      { name: "日用品", amountMinor: 8360, diffMinor: -2840 },
      { name: "交通", amountMinor: 5000, diffMinor: 5000 },
      { name: "娯楽", amountMinor: 3000, diffMinor: 3000 },
      { name: "医療", amountMinor: 1500, diffMinor: 1500 },
    ]);
    expect(report.week.others).toEqual({
      amountMinor: 1000,
      diffMinor: 1000,
      categoryCount: 2,
    });
    // メンバーの支出は負担額で、構成比は整数パーセント
    expect(report.week.members).toEqual([
      { displayName: "たいし", amountMinor: 22236, sharePercent: 60 },
      { displayName: "かこ", amountMinor: 14824, sharePercent: 40 },
    ]);

    // 累計は9/1〜9/6（8/31の食費と9/20の食費、25日の固定費は含まない）
    expect(report.month).toMatchObject({
      month: "2026-09",
      elapsedDays: 6,
      daysInMonth: 30,
      expenseTotal: 18860,
      incomeTotal: 300000,
      balance: 281140,
      previousMonthToDateExpenseTotal: 12300,
      comparison: { diffMinor: 6560 },
    });
    // 見込み = 18,860 + 18,860 × 24 ÷ 6 + 未到来の固定費 80,000
    expect(report.month.forecastExpenseTotal).toBe(18860 + 75440 + 80000);
    expect(report.month.members).toEqual([
      { displayName: "たいし", amountMinor: 11316, sharePercent: 60 },
      { displayName: "かこ", amountMinor: 7544, sharePercent: 40 },
    ]);

    // 予算は対象月全体（9/20の食費と25日の固定費を含む）で予算画面と一致する
    expect(report.budget?.progress).toMatchObject({
      limitMinor: 300000,
      usedMinor: 100860,
      remainingMinor: 199140,
      usedPercent: 34,
      status: "ok",
    });
    expect(report.budget?.dailyAllowanceMinor).toBe(Math.floor(199140 / 24));
    expect(report.budget?.forecastWithinLimit).toBe(true);
    expect(
      report.budget?.progress.categories.map((item) => [
        item.name,
        item.status,
      ]),
    ).toEqual([
      ["食費", "ok"],
      ["住居", "over"],
      ["日用品", "ok"],
    ]);
  });

  it("予算改定がない月は予算をnullにする", () => {
    const report = buildWeeklyReport("わが家", period, {
      ...source,
      budget: null,
    });
    expect(report.budget).toBeNull();
  });

  it("負担額が同じメンバーは表示名順に並び、0円のメンバーも残す", () => {
    const report = buildWeeklyReport("わが家", period, {
      ...source,
      expenses: [
        {
          ...expenseRow("2026-09-02", 1000, FOOD, "食費", 500),
        },
      ],
      recurring: [],
      members: [
        { id: MEMBER_B, displayName: "かこ" },
        { id: MEMBER_A, displayName: "たいし" },
        { id: "40000000-0000-4000-8000-000000000003", displayName: "あき" },
      ],
    });

    expect(report.week.members).toEqual([
      { displayName: "かこ", amountMinor: 500, sharePercent: 50 },
      { displayName: "たいし", amountMinor: 500, sharePercent: 50 },
      { displayName: "あき", amountMinor: 0, sharePercent: 0 },
    ]);
  });
});

describe("estimateMonthEndExpense", () => {
  it("変動費を日割りし、未到来の固定費を加える (AC-NOTIF-003-3)", () => {
    expect(
      estimateMonthEndExpense({
        monthToDateTotal: 18860,
        variableToDate: 18860,
        recurringRemaining: 80000,
        elapsedDays: 6,
        daysInMonth: 30,
      }),
    ).toBe(174300);
  });

  it("日割りは整数演算で四捨五入する", () => {
    // 1,001 × 23 ÷ 7 = 3,289.0… → 3,289
    expect(
      estimateMonthEndExpense({
        monthToDateTotal: 1001,
        variableToDate: 1001,
        recurringRemaining: 0,
        elapsedDays: 7,
        daysInMonth: 30,
      }),
    ).toBe(1001 + 3289);
    // 10 × 29 ÷ 1 = 290
    expect(
      estimateMonthEndExpense({
        monthToDateTotal: 10,
        variableToDate: 10,
        recurringRemaining: 0,
        elapsedDays: 1,
        daysInMonth: 30,
      }),
    ).toBe(300);
    // 5 × 3 ÷ 27 = 0.55… → 1
    expect(
      estimateMonthEndExpense({
        monthToDateTotal: 5,
        variableToDate: 5,
        recurringRemaining: 0,
        elapsedDays: 27,
        daysInMonth: 30,
      }),
    ).toBe(6);
  });

  it("残り日数が0日なら累計支出と一致する", () => {
    expect(
      estimateMonthEndExpense({
        monthToDateTotal: 123456,
        variableToDate: 100000,
        recurringRemaining: 0,
        elapsedDays: 31,
        daysInMonth: 31,
      }),
    ).toBe(123456);
  });
});

describe("formatUsageBar", () => {
  it("10%ごとに1つ塗り、100%以上は全部塗る (AC-NOTIF-002-3)", () => {
    expect(formatUsageBar(0)).toBe("░░░░░░░░░░");
    expect(formatUsageBar(5)).toBe("░░░░░░░░░░");
    expect(formatUsageBar(34)).toBe("███░░░░░░░");
    expect(formatUsageBar(99)).toBe("█████████░");
    expect(formatUsageBar(100)).toBe("██████████");
    expect(formatUsageBar(117)).toBe("██████████");
  });
});

describe("formatWeeklyReportMessage", () => {
  it("5ブロックのテキストを仕様の形式で組み立てる (AC-NOTIF-002-1)", () => {
    const message = formatWeeklyReportMessage(
      buildWeeklyReport("わが家", period, source),
    );

    expect(message).toBe(
      [
        "【わが家】週次サマリー",
        "📅 今週（8/31〜9/6）",
        "支出 ￥37,060（先週比 −￥4,140）",
        "・食費 ￥18,200（−￥11,800）",
        "・日用品 ￥8,360（−￥2,840）",
        "・交通 ￥5,000（＋￥5,000）",
        "・娯楽 ￥3,000（＋￥3,000）",
        "・医療 ￥1,500（＋￥1,500）",
        "・その他のカテゴリ ￥1,000（＋￥1,000）",
        "",
        "メンバーの支出",
        "・たいし ￥22,236（60%）",
        "・かこ ￥14,824（40%）",
        "",
        "📆 9月の累計（6日経過）",
        "支出 ￥18,860",
        "収入 ￥300,000",
        "収支 ＋￥281,140",
        "先月の同時点 ￥12,300（先月比 ＋￥6,560）",
        "月末の見込み ￥174,300",
        "",
        "メンバーの累計支出",
        "・たいし ￥11,316",
        "・かこ ￥7,544",
        "",
        "🎯 9月の予算 ￥300,000",
        "███░░░░░░░ 34%・残り ￥199,140",
        "1日あたり ￥8,297 使えます",
        "見込みは予算内",
        "⚠ 住居 超過（100%）",
      ].join("\n"),
    );
  });

  it("支出0件の週は0件用の文面にし、メンバーの支出を省き、予算がなければ累計で終わる", () => {
    const quietSource: WeeklyReportSource = {
      expenses: [expenseRow("2026-09-20", 2000, FOOD, "食費", 1200)],
      incomes: [],
      recurring: [],
      budget: null,
      members,
    };
    const message = formatWeeklyReportMessage(
      buildWeeklyReport("わが家", period, quietSource),
    );

    expect(message).toBe(
      [
        "【わが家】週次サマリー",
        "📅 今週（8/31〜9/6）",
        "今週の支出登録はありませんでした。",
        "",
        "📆 9月の累計（6日経過）",
        "支出 ￥0",
        "収入 ￥0",
        "収支 ±￥0",
        "先月の同時点 ￥0（先月比 ±￥0）",
        "月末の見込み ￥0",
        "",
        "メンバーの累計支出",
        "・かこ ￥0",
        "・たいし ￥0",
      ].join("\n"),
    );
  });

  it("予算超過では全部塗ったバー・超過額・見込み超過を出し、1日あたりの行を出さない", () => {
    const overSource: WeeklyReportSource = {
      expenses: [expenseRow("2026-09-01", 350000, FOOD, "食費", 350000)],
      incomes: [],
      recurring: [],
      budget: {
        effectiveMonth: "2026-09",
        status: "active",
        totalAmountMinor: 300000,
        version: 1,
        categoryLimits: [
          {
            categoryId: FOOD,
            categoryName: "食費",
            categoryColor: "food",
            amountMinor: 100000,
          },
        ],
      },
      members,
    };
    const message = formatWeeklyReportMessage(
      buildWeeklyReport("わが家", period, overSource),
    );

    expect(message).toContain("支出 ￥350,000（先週比 ＋￥350,000）\n");
    expect(message).toContain("・たいし ￥350,000（100%）\n・かこ ￥0（0%）");
    expect(message).toContain("月末の見込み ￥1,750,000");
    expect(message).toContain(
      "██████████ 117%・超過 ￥50,000\n見込みは予算超過\n",
    );
    expect(message).not.toContain("1日あたり");
    expect(message).toContain("⚠ 食費 超過（350%）");
  });

  it("停止改定の月は予算ブロックを出さない", () => {
    const message = formatWeeklyReportMessage(
      buildWeeklyReport("わが家", period, {
        ...source,
        budget: {
          effectiveMonth: "2026-09",
          status: "disabled",
          totalAmountMinor: null,
          version: 3,
          categoryLimits: [],
        },
      }),
    );

    expect(message).not.toContain("予算");
  });
});
