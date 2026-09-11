import {
  createGroup,
  currentMonthInGroupTimezone,
  openCalendar,
} from "./support/app-actions";
import { E2E_USER_A } from "./support/e2e-users";
import { expect, test } from "./support/fixtures";

const RECURRING_NAME =
  "家賃・共益費・駐車場代をまとめた毎月の固定費（自宅マンション）";
const RECURRING_AMOUNT = 80000;

// E2E-009 固定費の登録と一覧表示
// （REC-001〜REC-004、AC-REC-004-1、AC-REC-002-2）
test("E2E-009 登録した固定費が再読み込み後も一覧とカレンダーへ表示される @desktop", async ({
  memberPage,
}, testInfo) => {
  const groupId = await createGroup(memberPage, "E2E 固定費");
  const month = currentMonthInGroupTimezone();

  await memberPage.goto(`/groups/${groupId}/recurring-transactions`);
  await expect(
    memberPage.getByRole("heading", { name: "登録済みの固定費" }),
  ).toBeVisible();

  const form = memberPage.locator("form").filter({ hasText: "固定費を追加" });
  await form.getByLabel("名称").fill(RECURRING_NAME);
  await form.getByLabel("メモ").fill("共益費込みの住居費");
  await form.getByLabel("金額").fill(String(RECURRING_AMOUNT));
  // 金額欄は入力中も3桁区切りで表示し、送信値は整数のまま (AC-REC-005-5)
  await expect(form.getByLabel("金額")).toHaveValue("80,000");
  await form.getByLabel("毎月の日付").selectOption("1");
  await form.getByLabel("開始月").fill(month);
  await form.getByLabel("カテゴリ").selectOption({ label: "住居" });
  // 支払者の入力欄はなく、自分が自動設定される (AC-TXN-018-1)
  await expect(form.getByLabel("支払う人")).toHaveCount(0);
  await expect(form.locator('input[name="partyMemberId"]')).toHaveAttribute(
    "type",
    "hidden",
  );
  await form.getByRole("button", { name: "固定費を保存" }).click();

  const card = memberPage
    .getByRole("listitem")
    .filter({ hasText: RECURRING_NAME });
  await expect(card).toBeVisible();

  // 1件以上登録された状態で再読み込みしてもerror境界へ落ちない (AC-REC-004-1)
  await memberPage.reload();
  await expect(
    memberPage.getByRole("heading", { name: "固定費", exact: true }),
  ).toBeVisible();
  await expect(
    memberPage.getByRole("heading", { name: "固定費を開けませんでした" }),
  ).toHaveCount(0);
  await expect(card).toBeVisible();
  await expect(card).toContainText("毎月1日に￥80,000");
  await expect(card).toContainText("住居");
  await expect(card).toContainText(E2E_USER_A.displayName);

  // 当月カレンダーへ展開され、月間合計へ含まれる (AC-REC-002-2)
  await openCalendar(memberPage, groupId, { month, scope: "group" });
  await expect(
    memberPage.getByRole("region", { name: /月間合計$/ }),
  ).toContainText("￥80,000");
  await memberPage.getByRole("link", { name: /月1日、支出/ }).click();
  const panel = memberPage.getByRole("complementary");
  await expect(panel).toContainText(RECURRING_NAME);
  await expect(panel).toContainText("共益費込みの住居費");
  for (const width of testInfo.project.name === "mobile"
    ? [375, 320]
    : [1280]) {
    await memberPage.setViewportSize({
      width,
      height: width === 1280 ? 800 : 812,
    });
    expect(
      await memberPage.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBe(0);
    await memberPage.screenshot({
      path: testInfo.outputPath(`fixed-cost-day-${width}.png`),
      fullPage: true,
    });
  }
  await memberPage.reload();
  await expect(panel).toContainText(RECURRING_NAME);
});
