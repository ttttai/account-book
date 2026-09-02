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
  await expect(
    memberPage.getByRole("group", { name: "期間の支出" }),
  ).toContainText("￥6,000");
  await expect(
    memberPage.getByRole("table", { name: "月別の正確な数値" }),
  ).toContainText("￥6,000");
  await expect(
    memberPage.getByRole("table", { name: "メンバー別の内訳" }),
  ).toContainText("負担額");

  await memberPage.getByRole("link", { name: "3か月" }).click();
  const month = currentMonthInGroupTimezone();
  await expect(memberPage).toHaveURL(new RegExp(`end=${month}`));
  await expect(
    memberPage
      .getByRole("table", { name: "月別の正確な数値" })
      .locator("tbody tr"),
  ).toHaveCount(3);

  // DOM上に見出しが残るだけでなく、モバイルで各金額の意味を視認できることを検証する。
  const widths = testInfo.project.name === "mobile" ? [320, 375] : [1280];
  for (const width of widths) {
    await memberPage.setViewportSize({
      width,
      height: width < 520 ? 812 : 800,
    });
    for (const [name, labels] of [
      ["月別の正確な数値", ["支出", "収入", "収支"]],
      ["メンバー別の内訳", ["負担額", "支払額", "受取額"]],
    ] as const) {
      const table = memberPage.getByRole("table", { name });
      const rows = table.locator("tbody tr");
      for (const row of await rows.all()) {
        for (const [index, label] of labels.entries()) {
          const cell = row.getByRole("cell").nth(index);
          const cellLabel = cell.getByText(label, { exact: true });
          if (width <= 520) await expect(cellLabel).toBeVisible();
          else await expect(cellLabel).toBeHidden();
        }
      }
      if (width > 520) {
        for (const label of labels) {
          await expect(
            table.getByRole("columnheader", { name: label, exact: true }),
          ).toBeVisible();
        }
      }
    }
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
