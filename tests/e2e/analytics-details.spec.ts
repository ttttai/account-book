import {
  createGroup,
  currentMonthInGroupTimezone,
  registerExpense,
} from "./support/app-actions";
import { expect, test } from "./support/fixtures";

// E2E-010 詳細分析の期間指標・数値表・URL条件（ANA-006〜ANA-009）
test("E2E-010 詳細分析で期間統計を数値とURLから確認できる @desktop", async ({
  memberPage,
}) => {
  const groupId = await createGroup(memberPage, "E2E 詳細分析");
  await registerExpense(memberPage, {
    groupId,
    amount: 6000,
    categoryName: "食費",
    memo: "E2E 詳細分析",
  });

  await memberPage.goto(`/groups/${groupId}/analytics/details`);
  await expect(
    memberPage.getByRole("heading", { name: /詳細分析/ }),
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
});
