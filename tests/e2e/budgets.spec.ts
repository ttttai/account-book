import {
  createGroup,
  currentMonthInGroupTimezone,
  registerExpense,
} from "./support/app-actions";
import { expect, test } from "./support/fixtures";

// E2E-010 月間予算の設定と予算画面・分析概要での進捗表示
// （BUD-001〜BUD-010、AC-BUD-004-1、AC-BUD-007-1、AC-BUD-008-1、AC-BUD-010-1）
test("E2E-010 設定した予算に対して実績・残額・状態が予算画面と分析概要で一致する @desktop", async ({
  memberPage,
}) => {
  const groupId = await createGroup(memberPage, "E2E 予算");
  const month = currentMonthInGroupTimezone();

  await memberPage.goto(`/groups/${groupId}/budgets?month=${month}`);
  await expect(
    memberPage.getByRole("heading", { name: "予算", exact: true }),
  ).toBeVisible();
  await expect(
    memberPage.getByText("この月には予算が設定されていません。"),
  ).toBeVisible();

  // owner/adminが当月からグループ予算とカテゴリ予算を設定する (AC-BUD-001-1)
  await memberPage.getByRole("textbox", { name: "グループ予算" }).fill("50000");
  await memberPage.getByLabel("食費").fill("20000");
  await expect(
    memberPage.getByText(/カテゴリ予算の合計 ￥20,000/),
  ).toBeVisible();
  await expect(memberPage.getByText(/未配分 ￥30,000/)).toBeVisible();
  await memberPage.getByRole("button", { name: "予算を設定" }).click();

  const summary = memberPage.getByRole("region", { name: "グループ予算" });
  await expect(summary).toBeVisible();
  await expect(summary).toContainText("￥50,000");
  await expect(summary).toContainText("順調");

  // 支出を登録すると実績・残額・消化率が更新される (AC-BUD-004-1)
  await registerExpense(memberPage, {
    groupId,
    amount: 6000,
    categoryName: "食費",
  });
  await memberPage.goto(`/groups/${groupId}/budgets?month=${month}`);
  await expect(summary).toContainText("￥6,000");
  await expect(summary).toContainText("￥44,000");
  await expect(summary).toContainText("12%");
  const foodRow = memberPage
    .getByRole("list", { name: "カテゴリ別予算" })
    .getByRole("listitem")
    .filter({ hasText: "食費" });
  await expect(foodRow).toContainText("￥6,000");
  await expect(foodRow).toContainText("￥14,000");

  // 分析概要の予算カードが同じ値を示す (AC-BUD-010-1)
  await memberPage.goto(
    `/groups/${groupId}/analytics?month=${month}&scope=group`,
  );
  const budgetCard = memberPage.getByRole("group", { name: "予算" });
  await expect(budgetCard).toContainText("￥50,000");
  await expect(budgetCard).toContainText("￥44,000");
  await expect(budgetCard).toContainText("12%");
  await expect(budgetCard).toContainText("順調");
  await budgetCard.getByRole("link", { name: "予算の詳細を見る" }).click();
  await memberPage.waitForURL(new RegExp(`/groups/${groupId}/budgets`));

  // 予算超過後も取引を登録でき、超過額が表示される (AC-BUD-008-1)
  await registerExpense(memberPage, {
    groupId,
    amount: 45000,
    categoryName: "食費",
  });
  await memberPage.goto(`/groups/${groupId}/budgets?month=${month}`);
  await expect(summary).toContainText("￥51,000");
  await expect(summary).toContainText("超過 ￥1,000");
  await expect(summary).toContainText("102%");
  await expect(summary.getByText("超過", { exact: true })).toBeVisible();
});

// Linkで移動した場合のClient stateと送信対象を実ブラウザで確認する。
test("E2E-010 月を往復しても各月の予算だけを保存する @desktop", async ({
  memberPage,
}) => {
  const groupId = await createGroup(memberPage, "E2E 予算月移動");
  const month = currentMonthInGroupTimezone();
  await memberPage.goto(`/groups/${groupId}/budgets?month=${month}`);
  await memberPage.getByRole("textbox", { name: "グループ予算" }).fill("50000");
  await memberPage.getByLabel("食費").fill("20000");
  await memberPage.getByRole("button", { name: "予算を設定" }).click();
  await expect(memberPage.getByText("予算を保存しました。")).toBeVisible();
  const navigation = memberPage
    .locator("header")
    .filter({ has: memberPage.getByRole("heading", { level: 2 }) });
  await navigation.getByRole("link").last().click();
  await expect(
    memberPage.getByRole("button", { name: "この月から変更" }),
  ).toBeVisible();
  await memberPage.getByRole("textbox", { name: "グループ予算" }).fill("80000");
  await memberPage.getByLabel("食費").fill("30000");
  await memberPage.getByRole("button", { name: "この月から変更" }).click();
  await expect(memberPage.getByText("予算を保存しました。")).toBeVisible();
  await navigation.getByRole("link").first().click();
  await expect(
    memberPage.getByRole("textbox", { name: "グループ予算" }),
  ).toHaveValue("50000");
  await expect(memberPage.getByLabel("食費")).toHaveValue("20000");
  await memberPage.getByRole("textbox", { name: "グループ予算" }).fill("55000");
  await memberPage.getByRole("button", { name: "予算を保存" }).click();
  await expect(
    memberPage.getByRole("region", { name: "グループ予算" }),
  ).toContainText("￥55,000");
  await navigation.getByRole("link").last().click();
  await expect(
    memberPage.getByRole("textbox", { name: "グループ予算" }),
  ).toHaveValue("80000");
  await expect(memberPage.getByLabel("食費")).toHaveValue("30000");
  for (const width of [375, 1280, 320]) {
    await memberPage.setViewportSize({
      width,
      height: width === 1280 ? 800 : 812,
    });
    expect(
      await memberPage.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);
    await memberPage.screenshot({
      path: `test-results/budget-month-navigation-${width}.png`,
      fullPage: true,
    });
  }
});
