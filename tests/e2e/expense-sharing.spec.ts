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
  const scopeNav = ownerPage.getByRole("navigation", {
    name: "カレンダーの集計対象",
  });
  await expect(scopeNav.getByRole("link")).toHaveText(["グループ", "自分"]);
  await expect(scopeNav.locator("details")).toHaveCount(0);
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
}, testInfo) => {
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

  const scopeNav = memberPage.getByRole("navigation", {
    name: "カレンダーの集計対象",
  });
  await expect(scopeNav.getByRole("link")).toHaveText([
    "グループ",
    "自分",
    E2E_USER_B.displayName,
  ]);
  await expect(scopeNav.locator("details")).toHaveCount(0);
  await scopeNav
    .getByRole("link", { name: E2E_USER_B.displayName, exact: true })
    .click();
  await expect(memberPage).toHaveURL(/scope=member&member=[0-9a-f-]{36}/);
  await expect(monthlyTotal(memberPage)).toContainText("￥3,000");
  await expect(
    scopeNav.getByRole("link", { name: E2E_USER_B.displayName, exact: true }),
  ).toHaveAttribute("aria-current", "page");
  const selectedMember = new URL(memberPage.url()).searchParams.get("member");
  const previousMonthHref = await memberPage
    .getByRole("link", { name: /^\d{4}年\d{1,2}月を表示$/ })
    .first()
    .getAttribute("href");
  if (!previousMonthHref) throw new Error("前月のリンクが必要です");
  await memberPage
    .getByRole("link", { name: /^\d{4}年\d{1,2}月を表示$/ })
    .first()
    .click();
  await expect(memberPage).toHaveURL(
    new URL(previousMonthHref, memberPage.url()).toString(),
  );
  await memberPage
    .getByRole("link", { name: /^\d{4}年\d{1,2}月を表示$/ })
    .last()
    .click();
  await expect(memberPage).toHaveURL(
    new RegExp(`month=${month}&scope=member&member=${selectedMember}`),
  );
  for (const width of testInfo.project.name === "mobile"
    ? [375, 320]
    : [1280]) {
    await memberPage.setViewportSize({
      width,
      height: width === 1280 ? 800 : 812,
    });
    const boxes = await scopeNav.getByRole("link").evaluateAll((links) =>
      links.map((link) => {
        const { x, y, width, height } = link.getBoundingClientRect();
        return {
          x,
          y,
          width,
          height,
          isClipped: link.scrollWidth > link.clientWidth,
        };
      }),
    );
    expect(boxes).toHaveLength(3);
    for (const box of boxes) {
      expect(box.height).toBeGreaterThanOrEqual(44);
      expect(Math.abs(box.y - boxes[0].y)).toBeLessThan(1);
      expect(box.x + box.width).toBeLessThanOrEqual(width);
      // 「グループ」「自分」と相手の表示名のいずれも省略されない (AC-CAL-004-3)
      expect(box.isClipped).toBe(false);
    }
    // 3枠目は320pxでも「グループ」枠以上の幅を持つ (AC-CAL-004-3)
    expect(boxes[2].width).toBeGreaterThanOrEqual(boxes[0].width);
    expect(
      await memberPage.evaluate(
        () => document.documentElement.scrollWidth - innerWidth,
      ),
    ).toBe(0);
    await memberPage.screenshot({
      path: testInfo.outputPath(`calendar-member-tabs-${width}.png`),
      fullPage: true,
    });
  }

  // 日別取引に「内訳」を表示し、支払者を表示しない (AC-TXN-018-3)
  await openCalendar(memberPage, groupId, { month, scope: "group", day });
  const dayPanel = memberPage.getByRole("complementary");
  await expect(dayPanel).toContainText("￥6,000");
  await expect(dayPanel).toContainText("内訳");
  await expect(dayPanel).toContainText(`${E2E_USER_A.displayName} ￥3,000`);
  await expect(dayPanel).toContainText(`${E2E_USER_B.displayName} ￥3,000`);
  await expect(dayPanel).not.toContainText("支払者");
  await expect(dayPanel).not.toContainText("負担");

  // 履歴は自分の支出額を主表示し、取引全体と区別する (HIS-003、HIS-004)
  await memberPage.goto(`/groups/${groupId}/history`);
  // chipのタップはページ全体を再読み込みしない。タップ前に置いた印が残ることで確認する (AC-HIS-008-1)
  await memberPage.evaluate(() => {
    (window as Window & { __e2eHistoryMarker?: boolean }).__e2eHistoryMarker =
      true;
  });
  await memberPage.getByRole("link", { name: "自分の支出" }).click();
  const historyRows = memberPage.getByRole("region", {
    name: "取引履歴の一覧",
  });
  await expect(historyRows).toContainText("取引全体 ￥6,000");
  await expect(memberPage).toHaveURL(/[?&]member=[0-9a-f-]{36}/);
  expect(
    await memberPage.evaluate(
      () =>
        (window as Window & { __e2eHistoryMarker?: boolean })
          .__e2eHistoryMarker,
    ),
  ).toBe(true);
  // sheetの「支出した人」はchipの切り替えへ同期する。375pxではbottom sheetを開いて確認する (AC-HIS-003-3, AC-HIS-008-5)
  if (testInfo.project.name === "mobile") {
    await memberPage.getByRole("button", { name: /^絞り込み/ }).click();
  }
  await expect(memberPage.getByLabel("支出した人")).toHaveValue(
    new URL(memberPage.url()).searchParams.get("member") ?? "",
  );
  await expect(
    memberPage.getByRole("button", { name: "絞り込みを適用" }),
  ).toHaveCount(0);
  if (testInfo.project.name === "mobile") {
    await memberPage.getByRole("button", { name: "絞り込みを閉じる" }).click();
  }
  await expect(historyRows.locator('[class*="history-amount"]')).toHaveText(
    "￥3,000",
  );
  // 「〇〇の支出」の主金額ラベルは行リンクのアクセシブル名で示す (AC-HIS-006-3, AC-HIS-006-4)
  await expect(historyRows.getByRole("link")).toHaveAccessibleName(
    new RegExp(`${E2E_USER_A.displayName}の支出 ￥3,000 取引全体 ￥6,000`),
  );
  await expect(historyRows).toContainText("食費");
  // 支出した人を表示名の列挙だけで示し、見出し語と人数の要約は出さない。並び順はDBの返却順に依存するため両名の存在で確認する (AC-HIS-007-1)
  await expect(historyRows).toContainText(E2E_USER_A.displayName);
  await expect(historyRows).toContainText(E2E_USER_B.displayName);
  await expect(historyRows).not.toContainText("支出した人");
  await expect(historyRows).not.toContainText("人で分割");
  await expect(historyRows.getByRole("link", { name: "編集" })).toHaveCount(0);
  await expect(historyRows).not.toContainText("支払者");
  await expect(historyRows).not.toContainText("負担");
  await expect(memberPage.getByLabel("支払者")).toHaveCount(0);
  await expect(
    memberPage.getByRole("link", { name: "自分が支払った", exact: true }),
  ).toHaveCount(0);
  await expect(
    memberPage.getByRole("link", { name: "自分が負担", exact: true }),
  ).toHaveCount(0);
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
      path: testInfo.outputPath(`history-burden-${width}.png`),
      fullPage: true,
    });
  }
  await memberPage.reload();
  await expect(historyRows.locator('[class*="history-amount"]')).toHaveText(
    "￥3,000",
  );
  // 行全体のタップで取引編集へ遷移し、戻り先に履歴URLを持つ (AC-HIS-006-3)
  await historyRows.getByRole("link").click();
  await expect(memberPage).toHaveURL(
    /\/transactions\/[0-9a-f-]{36}\/edit\?from=.*history/,
  );
  const partnerPage = await openUserPage(E2E_USER_B);
  await partnerPage.goto(`/groups/${groupId}/history`);
  await partnerPage
    .getByRole("link", { name: "自分の支出", exact: true })
    .click();
  await expect(
    partnerPage
      .getByRole("region", { name: "取引履歴の一覧" })
      .locator('[class*="history-amount"]'),
  ).toHaveText("￥3,000");
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
