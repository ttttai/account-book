import {
  createGroup,
  currentMonthInGroupTimezone,
  openCalendar,
  registerExpense,
  todayInGroupTimezone,
} from "./support/app-actions";
import { expect, test } from "./support/fixtures";

const LARGE_AMOUNT = 12800;

// E2E-006 日付選択の即時反映とURL同期（CAL-002、CAL-005、CAL-011）
test("E2E-006 同じ月内の日付選択を再取得なしで切り替え、URLと履歴を同期する", async ({
  memberPage,
}) => {
  const groupId = await createGroup(memberPage, "E2E 日付選択");
  const day = todayInGroupTimezone();
  const month = currentMonthInGroupTimezone();

  await registerExpense(memberPage, {
    groupId,
    amount: LARGE_AMOUNT,
    categoryName: "食費",
    transactionDate: day,
  });

  await openCalendar(memberPage, groupId, { month, scope: "group" });

  // 10,000円以上でも「万」表記や丸めをせず、桁区切りの正確な数字を表示する (CAL-002)
  const dayCell = memberPage.getByRole("link", {
    name: new RegExp(`支出￥${LARGE_AMOUNT.toLocaleString("en-US")}`),
  });
  await expect(dayCell).toBeVisible();
  await expect(dayCell).toContainText("12,800");
  await expect(dayCell).not.toContainText("万");

  // 全画面再取得が起きればmarkerは失われる。CAL-011の即時反映をDOM保持で確認する
  await memberPage.evaluate(() => {
    Object.assign(window, { __e2eCalendarMarker: "kept" });
  });

  await dayCell.click();
  await expect(memberPage).toHaveURL(new RegExp(`day=${day}`));
  const dayPanel = memberPage.getByRole("complementary");
  await expect(dayPanel).toContainText("￥12,800");
  await expect(memberPage.getByLabel("カレンダーを読み込み中")).toHaveCount(0);
  expect(
    await memberPage.evaluate(
      () =>
        (window as unknown as { __e2eCalendarMarker?: string })
          .__e2eCalendarMarker,
    ),
  ).toBe("kept");

  // 同じ月・集計対象内で別の日付へ切り替えても、月間データを取り直さない
  const otherDay = `${month}-15` === day ? `${month}-16` : `${month}-15`;
  await memberPage
    .getByRole("link", { name: new RegExp(`${Number(otherDay.slice(8))}日、`) })
    .click();
  await expect(memberPage).toHaveURL(new RegExp(`day=${otherDay}`));
  expect(
    await memberPage.evaluate(
      () =>
        (window as unknown as { __e2eCalendarMarker?: string })
          .__e2eCalendarMarker,
    ),
  ).toBe("kept");

  // 戻る・進むで選択日と日別パネルが同期する
  await memberPage.goBack();
  await expect(memberPage).toHaveURL(new RegExp(`day=${day}`));
  await expect(memberPage.getByRole("complementary")).toContainText("￥12,800");

  await memberPage.goForward();
  await expect(memberPage).toHaveURL(new RegExp(`day=${otherDay}`));

  // 閉じるとday paramが外れ、日別パネルも閉じる
  await memberPage.getByRole("link", { name: "日別取引を閉じる" }).click();
  await expect(memberPage).not.toHaveURL(/day=/);
  await expect(memberPage.getByRole("complementary")).toHaveCount(0);
});
