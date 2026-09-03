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
import { E2E_USER_B } from "./support/e2e-users";
import { expect, test } from "./support/fixtures";

const OTHER_MEMBER_AMOUNT = 4321;

function monthlyTotal(page: Page) {
  return page.getByRole("region", { name: /月間合計$/ });
}

// E2E-011 他メンバーの登録がホームへ自動反映される（SYNC-001、SYNC-003、SYNC-004、AC-SYNC-001-1）
test("E2E-011 開いたままのホームへ他メンバーの支出が操作なしで反映される @desktop", async ({
  memberPage,
  openUserPage,
}) => {
  const groupId = await createGroup(memberPage, "E2E 自動反映");
  const shareUrl = await createInvitationLink(memberPage, groupId, "メンバー");
  const otherPage = await openUserPage(E2E_USER_B);
  await acceptInvitation(otherPage, shareUrl);

  const month = currentMonthInGroupTimezone();
  const day = todayInGroupTimezone();
  await openCalendar(memberPage, groupId, { month, scope: "group" });
  await expect(monthlyTotal(memberPage)).toBeVisible();
  await expect(monthlyTotal(memberPage)).not.toContainText("￥4,321");

  // 全画面再読み込みが起きればmarkerは失われる。再取得がServer Componentだけであることを確認する (AC-SYNC-004-1)
  await memberPage.evaluate(() => {
    Object.assign(window, { __e2eSyncMarker: "kept" });
  });
  const changesResponse = memberPage.waitForResponse((response) =>
    response.url().includes(`/api/v1/groups/${groupId}/changes`),
  );

  await registerExpense(otherPage, {
    groupId,
    amount: OTHER_MEMBER_AMOUNT,
    categoryName: "食費",
    transactionDate: day,
    memo: "E2E 自動反映",
  });

  // 閲覧側は操作せず、60秒以内に月間合計と日別金額が更新される (AC-SYNC-001-1)
  await expect(monthlyTotal(memberPage)).toContainText("￥4,321", {
    timeout: 70_000,
  });
  await expect(
    memberPage.getByRole("link", { name: /支出￥4,321/ }),
  ).toBeVisible();

  await expect(memberPage).toHaveURL(
    new RegExp(`/groups/${groupId}\\?month=${month}&scope=group$`),
  );
  await expect(memberPage.getByLabel("カレンダーを読み込み中")).toHaveCount(0);
  expect(
    await memberPage.evaluate(
      () => (window as unknown as { __e2eSyncMarker?: string }).__e2eSyncMarker,
    ),
  ).toBe("kept");

  // 変更確認の応答は不透明なtokenだけで、金額・件数・時刻を含まない (AC-SYNC-003-3)
  const response = await changesResponse;
  expect(response.status()).toBe(200);
  expect(response.headers()["cache-control"]).toContain("no-store");
  const body = (await response.json()) as Record<string, unknown>;
  expect(Object.keys(body)).toEqual(["token"]);
  expect(body.token).toMatch(/^[0-9a-f]{32}$/);
});
