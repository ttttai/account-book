import {
  createGroup,
  currentMonthInGroupTimezone,
  registerExpense,
} from "./support/app-actions";
import { expect, test } from "./support/fixtures";

// E2E-010 詳細分析の期間指標・数値表・URL条件（ANA-006〜ANA-009）
test("E2E-010 詳細分析で期間統計を数値とURLから確認できる @desktop", async ({
  memberPage,
}, testInfo) => {
  const groupId = await createGroup(memberPage, "E2E 詳細分析");
  await registerExpense(memberPage, {
    groupId,
    amount: 6000,
    categoryName: "食費",
    memo: "E2E 詳細分析",
  });

  await memberPage.goto(`/groups/${groupId}/analytics/details`);
  await expect(
    memberPage.getByRole("form", { name: "詳細分析の表示条件" }),
  ).toBeVisible();
  // 期間指標の見出しは月数を含み、適用ボタンは存在しない (AC-ANA-008-5、AC-ANA-016-1)
  await expect(
    memberPage.getByRole("group", { name: "6か月の支出" }),
  ).toContainText("￥6,000");
  await expect(
    memberPage.getByRole("button", { name: "表示する" }),
  ).toHaveCount(0);
  await expect(
    memberPage.getByRole("table", { name: "月別の正確な数値" }),
  ).toContainText("￥6,000");
  // メンバー別表は支出額・受取額の2列で、支払額を表示しない (AC-TXN-018-4)
  await expect(
    memberPage.getByRole("table", { name: "メンバー別の内訳" }),
  ).toContainText("支出額");
  await expect(
    memberPage.getByRole("table", { name: "メンバー別の内訳" }),
  ).not.toContainText("支払額");
  // カテゴリ構成は既定で円グラフ。切替は遷移なしで横棒へ変わり、一覧の値は同じ (AC-ANA-014-1、AC-ANA-014-3)
  const categories = memberPage.getByRole("list", {
    name: "期間の支出カテゴリ",
  });
  await expect(categories).toContainText("食費");
  await expect(categories).toContainText("￥6,000");
  await expect(memberPage.locator("[data-analytics-pie]")).toBeVisible();
  const chartToggle = memberPage.getByRole("group", {
    name: "支出カテゴリの表示形式",
  });
  await expect(
    chartToggle.getByRole("button", { name: "円グラフ" }),
  ).toHaveAttribute("aria-pressed", "true");
  const urlBeforeToggle = memberPage.url();
  await chartToggle.getByRole("button", { name: "棒グラフ" }).click();
  await expect(
    chartToggle.getByRole("button", { name: "棒グラフ" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(memberPage.locator("[data-analytics-pie]")).toHaveCount(0);
  await expect(categories.locator("[data-analytics-bar]")).toHaveCount(1);
  await expect(categories).toContainText("￥6,000");
  expect(memberPage.url()).toBe(urlBeforeToggle);
  await chartToggle.getByRole("button", { name: "円グラフ" }).click();
  await expect(memberPage.locator("[data-analytics-pie]")).toBeVisible();
  // 月別推移は既定で支出の縦棒。切替は遷移なしで収入の棒へ変わり、数値表の値は同じ (AC-ANA-015-1、AC-ANA-015-3)
  const trend = memberPage.getByRole("region", { name: "月別推移" });
  const trendToggle = trend.getByRole("group", { name: "月別推移の系列" });
  await expect(
    trendToggle.getByRole("button", { name: "支出" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(trend.locator("[data-trend-bar='expense']")).toHaveCount(6);
  const urlBeforeTrendToggle = memberPage.url();
  await trendToggle.getByRole("button", { name: "収入" }).click();
  await expect(
    trendToggle.getByRole("button", { name: "収入" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(trend.locator("[data-trend-bar='income']")).toHaveCount(6);
  await expect(trend.locator("[data-trend-bar='expense']")).toHaveCount(0);
  expect(memberPage.url()).toBe(urlBeforeTrendToggle);
  await expect(
    memberPage.getByRole("table", { name: "月別の正確な数値" }),
  ).toContainText("￥6,000");
  await trendToggle.getByRole("button", { name: "支出" }).click();
  await expect(trend.locator("[data-trend-bar='expense']")).toHaveCount(6);
  // 累積収支は最終月で期間の収支と一致し、注記を表示する (AC-ANA-013-1、3)
  const savings = memberPage.getByRole("region", { name: "貯金額の推移" });
  await expect(savings).toContainText("期間開始時を0円として計算");
  await expect(
    memberPage
      .getByRole("table", { name: "月別の正確な数値" })
      .locator("tbody tr")
      .last()
      .getByRole("cell")
      .nth(3),
  ).toContainText("−￥6,000");

  await memberPage.getByRole("link", { name: "3か月" }).click();
  const month = currentMonthInGroupTimezone();
  await expect(memberPage).toHaveURL(new RegExp(`end=${month}`));
  await expect(
    memberPage
      .getByRole("table", { name: "月別の正確な数値" })
      .locator("tbody tr"),
  ).toHaveCount(3);
  await expect(
    memberPage.getByRole("group", { name: "3か月の支出" }),
  ).toContainText("￥6,000");
  await expect(memberPage.getByRole("link", { name: "3か月" })).toHaveAttribute(
    "aria-current",
    "true",
  );

  // 集計対象の変更は「表示する」なしで反映し、ページ全体を再読み込みしない (AC-ANA-016-1、AC-ANA-016-2)
  await memberPage.evaluate(() => {
    (
      window as Window & { __analyticsDetailsMarker?: boolean }
    ).__analyticsDetailsMarker = true;
  });
  await memberPage.getByLabel("集計対象").selectOption("self");
  await expect(memberPage).toHaveURL(/scope=self/);
  await expect(
    memberPage.getByRole("table", { name: "メンバー別の内訳" }),
  ).toHaveCount(0);
  expect(
    await memberPage.evaluate(
      () =>
        (window as Window & { __analyticsDetailsMarker?: boolean })
          .__analyticsDetailsMarker,
    ),
  ).toBe(true);
  await memberPage.getByLabel("集計対象").selectOption("group");
  await expect(memberPage).toHaveURL(/scope=group/);
  await expect(
    memberPage.getByRole("table", { name: "メンバー別の内訳" }),
  ).toBeVisible();

  // DOM上に見出しが残るだけでなく、モバイルで各金額の意味を視認できることを検証する。
  const widths = testInfo.project.name === "mobile" ? [320, 375] : [1280];
  for (const width of widths) {
    await memberPage.setViewportSize({
      width,
      height: width < 520 ? 812 : 800,
    });
    // 開始月・終了月は「期間を指定」で開き、それぞれの列幅に収まってformの右端を越えない (AC-ANA-009-7、AC-ANA-016-4)
    const form = memberPage.getByRole("form", { name: "詳細分析の表示条件" });
    const rangeToggle = form.getByRole("button", { name: "期間を指定" });
    if ((await rangeToggle.getAttribute("aria-expanded")) !== "true") {
      await rangeToggle.click();
    }
    await expect(form.getByLabel("開始月")).toBeVisible();
    const formBox = await form.boundingBox();
    const startBox = await form.getByLabel("開始月").boundingBox();
    const endBox = await form.getByLabel("終了月").boundingBox();
    expect(formBox && startBox && endBox).toBeTruthy();
    if (formBox && startBox && endBox) {
      expect(startBox.x + startBox.width).toBeLessThanOrEqual(endBox.x);
      expect(endBox.x + endBox.width).toBeLessThanOrEqual(
        formBox.x + formBox.width + 1,
      );
      expect(startBox.height).toBeGreaterThanOrEqual(44);
      expect(endBox.height).toBeGreaterThanOrEqual(44);
    }
    // メンバー別表は520px以下で各セルに項目名を出し、広い画面では列見出しを使う (AC-ANA-009-6)
    const memberLabels = ["支出額", "受取額"];
    const memberTable = memberPage.getByRole("table", {
      name: "メンバー別の内訳",
    });
    for (const row of await memberTable.locator("tbody tr").all()) {
      for (const [index, label] of memberLabels.entries()) {
        const cellLabel = row
          .getByRole("cell")
          .nth(index)
          .getByText(label, { exact: true });
        if (width <= 520) await expect(cellLabel).toBeVisible();
        else await expect(cellLabel).toBeHidden();
      }
    }
    if (width > 520) {
      for (const label of memberLabels) {
        await expect(
          memberTable.getByRole("columnheader", { name: label, exact: true }),
        ).toBeVisible();
      }
    }
    // 月別表は全幅で列見出しを見せ、セル内の補助ラベルを持たない (AC-ANA-009-6)
    const monthTable = memberPage.getByRole("table", {
      name: "月別の正確な数値",
    });
    for (const label of ["月", "支出", "収入", "収支", "累積収支"]) {
      await expect(
        monthTable.getByRole("columnheader", { name: label, exact: true }),
      ).toBeVisible();
    }
    await expect(monthTable.locator("tbody [aria-hidden='true']")).toHaveCount(
      0,
    );
    expect(
      await memberPage.evaluate(
        () =>
          document.documentElement.scrollWidth <=
          document.documentElement.clientWidth,
      ),
    ).toBe(true);
    await memberPage.screenshot({
      path: testInfo.outputPath(`analytics-details-${width}.png`),
      fullPage: true,
    });
  }
});
