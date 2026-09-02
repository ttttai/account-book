import type { Page } from "@playwright/test";

import {
  acceptInvitation,
  createGroup,
  createInvitationLink,
  currentMonthInGroupTimezone,
  openCalendar,
  registerExpense,
  todayInGroupTimezone,
} from "./support/app-actions";
import { E2E_USER_A, E2E_USER_B } from "./support/e2e-users";
import { expect, test } from "./support/fixtures";

const SHARED_AMOUNT = 6000;

function monthlyTotal(page: Page) {
  return page.getByRole("region", { name: /月間合計$/ });
}

// E2E-004・E2E-005で共通に使う「2人メンバー + 均等共有支出」の状態を作る
async function setUpSharedExpense(
  ownerPage: Page,
  openUserPage: (user: typeof E2E_USER_B) => Promise<Page>,
  groupName: string,
): Promise<Readonly<{ groupId: string; month: string; day: string }>> {
  const groupId = await createGroup(ownerPage, groupName);
  const shareUrl = await createInvitationLink(ownerPage, groupId, "メンバー");
  const invitedPage = await openUserPage(E2E_USER_B);
  await acceptInvitation(invitedPage, shareUrl);

  await registerExpense(ownerPage, {
    groupId,
    amount: SHARED_AMOUNT,
    categoryName: "食費",
    allocation: "equal",
    equalMemberNames: [
      `${E2E_USER_A.displayName}（自分）`,
      E2E_USER_B.displayName,
    ],
    memo: "E2E 均等共有",
  });

  return {
    groupId,
    month: currentMonthInGroupTimezone(),
    day: todayInGroupTimezone(),
  };
}

// E2E-004 均等共有支出の登録とカレンダー・履歴の一致
// （TXN-001、TXN-005〜TXN-007、CAL-008、CAL-010、HIS-004）
test("E2E-004 均等共有支出がカレンダーと履歴で一致する @desktop", async ({
  memberPage,
  openUserPage,
}) => {
  const { groupId, month, day } = await setUpSharedExpense(
    memberPage,
    openUserPage,
    "E2E 均等共有",
  );

  await openCalendar(memberPage, groupId, { month, scope: "group" });
  await expect(monthlyTotal(memberPage)).toContainText("￥6,000");

  // 集計領域は負担額を「支出」として示し、立て替えた支払額を出さない (CAL-010)
  await expect(monthlyTotal(memberPage)).not.toContainText("支払額");

  await memberPage.getByRole("link", { name: "自分", exact: true }).click();
  await expect(memberPage).toHaveURL(/scope=self/);
  await expect(monthlyTotal(memberPage)).toContainText("￥3,000");

  await memberPage.locator("summary").filter({ hasText: "メンバー" }).click();
  await memberPage
    .getByRole("link", { name: E2E_USER_B.displayName, exact: true })
    .click();
  await expect(memberPage).toHaveURL(/scope=member&member=[0-9a-f-]{36}/);
  await expect(monthlyTotal(memberPage)).toContainText("￥3,000");

  // 日別取引に負担内訳を表示する
  await openCalendar(memberPage, groupId, { month, scope: "group", day });
  const dayPanel = memberPage.getByRole("complementary");
  await expect(dayPanel).toContainText("￥6,000");
  await expect(dayPanel).toContainText("負担");
  await expect(dayPanel).toContainText(`${E2E_USER_A.displayName} ￥3,000`);
  await expect(dayPanel).toContainText(`${E2E_USER_B.displayName} ￥3,000`);

  // 履歴の「自分が支払った」で支払者としての取引を抽出する (HIS-004)
  await memberPage.goto(`/groups/${groupId}/history`);
  await memberPage.getByRole("link", { name: "自分が支払った" }).click();
  const historyRows = memberPage.getByRole("region", {
    name: "取引履歴の一覧",
  });
  await expect(historyRows).toContainText("￥6,000");
  await expect(historyRows).toContainText("食費");
});

// E2E-005 支出の編集と削除（TXN-008、TXN-009、TXN-012）
test("E2E-005 支出を編集・削除するとカレンダー合計が追随する", async ({
  memberPage,
  openUserPage,
}) => {
  const { groupId, month, day } = await setUpSharedExpense(
    memberPage,
    openUserPage,
    "E2E 編集削除",
  );

  await openCalendar(memberPage, groupId, { month, scope: "group", day });
  await memberPage
    .getByRole("complementary")
    .getByRole("link", { name: "編集" })
    .click();
  await expect(memberPage).toHaveURL(/\/transactions\/[0-9a-f-]{36}\/edit/);

  // 楽観的ロック用のversionを画面が保持している (TXN-012)
  await expect(memberPage.locator('input[name="expectedVersion"]')).toHaveValue(
    "1",
  );

  await memberPage.getByLabel("金額").fill("");
  for (const digit of "8000") {
    await memberPage.getByRole("button", { name: digit, exact: true }).click();
  }
  await memberPage.getByRole("button", { name: "変更を保存" }).click();

  await expect(memberPage).toHaveURL(new RegExp(`/groups/${groupId}\\?`));
  await expect(monthlyTotal(memberPage)).toContainText("￥8,000");

  await openCalendar(memberPage, groupId, { month, scope: "group", day });
  await memberPage
    .getByRole("complementary")
    .getByRole("link", { name: "編集" })
    .click();
  // 削除操作と確認ボタンは固定入力ドックに覆われず、通常のclickで到達できる (AC-TXN-009-5)
  await memberPage.getByRole("button", { name: "この取引を削除する" }).click();
  await expect(memberPage.getByRole("alertdialog")).toContainText(
    "削除した取引は元に戻せません",
  );
  await memberPage.getByRole("button", { name: "削除を確定する" }).click();

  await expect(memberPage).toHaveURL(new RegExp(`/groups/${groupId}\\?`));
  await expect(monthlyTotal(memberPage)).toContainText("￥0");
  await expect(
    memberPage.getByText("この月の取引はまだありません。"),
  ).toBeVisible();
});
