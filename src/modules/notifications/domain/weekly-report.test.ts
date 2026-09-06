import { describe, expect, it } from "vitest";

import type { WeeklyReportPeriod } from "./report-period";
import type { WeeklyReportSource } from "./report-source";
import { buildWeeklyReport, formatWeeklyReportMessage } from "./weekly-report";

const FOOD = "30000000-0000-4000-8000-000000000001";
const DAILY = "30000000-0000-4000-8000-000000000002";
const TRANSPORT = "30000000-0000-4000-8000-000000000003";
const FUN = "30000000-0000-4000-8000-000000000004";
const MEDICAL = "30000000-0000-4000-8000-000000000005";
const CLOTHES = "30000000-0000-4000-8000-000000000006";
const OTHER = "30000000-0000-4000-8000-000000000007";
const HOME = "30000000-0000-4000-8000-000000000008";

const period: WeeklyReportPeriod = {
  week: { start: "2026-08-31", end: "2026-09-06" },
  previousWeek: { start: "2026-08-24", end: "2026-08-30" },
  month: "2026-09",
  months: ["2026-08", "2026-09"],
};

function expenseRow(
  date: string,
  amountMinor: number,
  categoryId: string,
  categoryName: string,
) {
  return {
    date,
    amountMinor,
    categoryId,
    categoryName,
    categoryColor: "token",
  };
}

const source: WeeklyReportSource = {
  expenses: [
    // 対象週（8/31〜9/6）
    expenseRow("2026-08-31", 18200, FOOD, "食費"),
    expenseRow("2026-09-01", 8360, DAILY, "日用品"),
    expenseRow("2026-09-02", 5000, TRANSPORT, "交通"),
    expenseRow("2026-09-03", 3000, FUN, "娯楽"),
    expenseRow("2026-09-04", 1500, MEDICAL, "医療"),
    expenseRow("2026-09-05", 900, CLOTHES, "衣服"),
    expenseRow("2026-09-06", 100, OTHER, "その他"),
    // 前週（8/24〜8/30）
    expenseRow("2026-08-24", 30000, FOOD, "食費"),
    expenseRow("2026-08-30", 11200, DAILY, "日用品"),
    // 対象月だが対象週の外
    expenseRow("2026-09-20", 2000, FOOD, "食費"),
  ],
  incomes: [{ date: "2026-09-01", amountMinor: 300000 }],
  recurring: [
    {
      id: "60000000-0000-4000-8000-000000000001",
      type: "expense",
      amountMinor: 80000,
      dayOfMonth: 25,
      // 9月から開始するため、前週(8/24〜8/30)には展開されない
      startMonth: "2026-09",
      endMonth: null,
      categoryId: HOME,
      categoryName: "住居",
      categoryColor: "home",
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
};

describe("buildWeeklyReport", () => {
  it("対象週・対象月・予算進捗を画面と同じ純関数で組み立てる (AC-NOTIF-003-1, AC-NOTIF-003-2)", () => {
    const report = buildWeeklyReport("わが家", period, source);

    expect(report.groupName).toBe("わが家");
    expect(report.week.range).toEqual(period.week);
    // 対象週の支出は単発7件（定期取引の25日は週の外）
    expect(report.week.expenseTotal).toBe(37060);
    expect(report.week.expenseCount).toBe(7);
    expect(report.week.comparison).toEqual({
      diffMinor: 37060 - 41200,
      changePercent: -10,
    });
    expect(report.week.breakdown.top.map((item) => item.name)).toEqual([
      "食費",
      "日用品",
      "交通",
      "娯楽",
      "医療",
    ]);
    expect(report.week.breakdown.others).toEqual({
      amountMinor: 1000,
      categoryCount: 2,
      sharePercent: 3,
    });

    // 対象月は定期取引（9/25 住居 80,000）と週外の取引を含む
    expect(report.month).toEqual({
      month: "2026-09",
      expenseTotal: 8360 + 5000 + 3000 + 1500 + 900 + 100 + 2000 + 80000,
      incomeTotal: 300000,
      balance: 300000 - 100860,
    });

    expect(report.budget).toMatchObject({
      limitMinor: 300000,
      usedMinor: 100860,
      remainingMinor: 199140,
      usedPercent: 34,
      status: "ok",
    });
    expect(
      report.budget?.categories.map((item) => [item.name, item.status]),
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
});

describe("formatWeeklyReportMessage", () => {
  it("3ブロックのテキストを仕様の形式で組み立てる (AC-NOTIF-002-1)", () => {
    const message = formatWeeklyReportMessage(
      buildWeeklyReport("わが家", period, source),
    );

    expect(message).toBe(
      [
        "【わが家】今週のまとめ（8/31〜9/6）",
        "支出 ￥37,060（7件）",
        "先週比 −￥4,140（−10%）",
        "・食費 ￥18,200",
        "・日用品 ￥8,360",
        "・交通 ￥5,000",
        "・娯楽 ￥3,000",
        "・医療 ￥1,500",
        "・その他のカテゴリ ￥1,000（2件）",
        "",
        "■ 9月の実績",
        "支出 ￥100,860 / 収入 ￥300,000 / 収支 ＋￥199,140",
        "",
        "■ 9月の予算 ￥300,000",
        "消化 34%・残り ￥199,140・順調",
        "・住居 超過（100%）",
      ].join("\n"),
    );
  });

  it("前週が0円なら比率を出さず、支出0件の週は0件用の文面にする", () => {
    const quietSource: WeeklyReportSource = {
      expenses: [expenseRow("2026-09-20", 2000, FOOD, "食費")],
      incomes: [],
      recurring: [],
      budget: null,
    };
    const message = formatWeeklyReportMessage(
      buildWeeklyReport("わが家", period, quietSource),
    );

    expect(message).toBe(
      [
        "【わが家】今週のまとめ（8/31〜9/6）",
        "今週の支出登録はありませんでした。",
        "",
        "■ 9月の実績",
        "支出 ￥2,000 / 収入 ￥0 / 収支 −￥2,000",
      ].join("\n"),
    );
  });

  it("前週0円で今週に支出がある場合は差額だけを出し、予算超過は超過額と状態を出す", () => {
    const overSource: WeeklyReportSource = {
      expenses: [expenseRow("2026-09-01", 350000, FOOD, "食費")],
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
    };
    const message = formatWeeklyReportMessage(
      buildWeeklyReport("わが家", period, overSource),
    );

    expect(message).toContain("先週比 ＋￥350,000\n");
    expect(message).toContain("消化 117%・超過 ￥50,000・超過");
    expect(message).toContain("・食費 超過（350%）");
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
