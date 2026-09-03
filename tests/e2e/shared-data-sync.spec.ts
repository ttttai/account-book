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
}, testInfo) => {
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
  await memberPage.screenshot({
    path: testInfo.outputPath("sync-home.png"),
    fullPage: true,
  });
});

// 初回tokenの取得を遅らせ、表示とtokenの時点差を実DB・実HTTPで再現する。
test("E2E-011 初回確認前の変更も画面へ反映する @desktop", async ({
  memberPage,
  openUserPage,
}) => {
  const groupId = await createGroup(memberPage, "E2E 初回同期");
  const otherPage = await openUserPage(E2E_USER_B);
  // 非メンバーへ変更tokenを返さない (AC-SYNC-003-1)。
  const denied = await otherPage.request.get(
    new URL(`/api/v1/groups/${groupId}/changes`, memberPage.url()).href,
  );
  expect(denied.status()).toBe(404);
  expect(await denied.json()).toEqual({ code: "NOT_FOUND" });
  await acceptInvitation(
    otherPage,
    await createInvitationLink(memberPage, groupId),
  );

  let release!: () => void;
  const delayed = new Promise<void>((resolve) => {
    release = resolve;
  });
  let started!: () => void;
  const requested = new Promise<void>((resolve) => {
    started = resolve;
  });
  await memberPage.route(
    `**/api/v1/groups/${groupId}/changes`,
    async (route) => {
      started();
      await delayed;
      await route.continue();
    },
  );
  await openCalendar(memberPage, groupId, {
    month: currentMonthInGroupTimezone(),
  });
  await requested;
  try {
    await expect(monthlyTotal(memberPage)).toContainText("￥0");
    await registerExpense(otherPage, {
      groupId,
      amount: 4321,
      categoryName: "食費",
    });
    await expect(monthlyTotal(memberPage)).toContainText("￥0");
  } finally {
    release();
  }
  await expect(monthlyTotal(memberPage)).toContainText("￥4,321", {
    timeout: 70_000,
  });
});

// 先頭ページが同じまま追加ページの行が削除される場合も、古い行を残さない。
test("E2E-011 履歴の追加ページの削除を自動反映する @desktop", async ({
  memberPage,
  openUserPage,
}, testInfo) => {
  const groupId = await createGroup(memberPage, "E2E 履歴同期");
  const otherPage = await openUserPage(E2E_USER_B);
  await acceptInvitation(
    otherPage,
    await createInvitationLink(memberPage, groupId),
  );
  await registerExpense(otherPage, {
    groupId,
    amount: 111,
    categoryName: "食費",
    memo: "削除対象の古い行",
  });
  await registerExpense(otherPage, {
    groupId,
    amount: 222,
    categoryName: "食費",
    memo: "維持する先頭行",
  });
  const initialSync = memberPage.waitForResponse(
    (response) =>
      response.request().headers().rsc === "1" &&
      response.url().includes(`/groups/${groupId}/history`),
  );
  await memberPage.goto(`/groups/${groupId}/history?limit=1`);
  const rows = memberPage.getByRole("region", { name: "取引履歴の一覧" });
  // 初回同期が完了してから追加する。再取得時にもフィルタの値は保たれる。
  await initialSync;
  await expect(rows).toContainText("維持する先頭行");
  await rows.getByRole("button", { name: "さらに読み込む" }).click();
  await expect(rows).toContainText("削除対象の古い行");
  await otherPage.goto(`/groups/${groupId}/history`);
  await otherPage
    .getByRole("listitem")
    .filter({ hasText: "削除対象の古い行" })
    .getByRole("link", { name: "編集" })
    .click();
  await otherPage.getByRole("button", { name: "この取引を削除する" }).click();
  await otherPage.getByRole("button", { name: "削除を確定する" }).click();
  await expect(rows).not.toContainText("削除対象の古い行", { timeout: 70_000 });
  await expect(rows).toContainText("維持する先頭行");
  await expect(
    rows.getByRole("button", { name: "さらに読み込む" }),
  ).toHaveCount(0);
  await expect(memberPage).toHaveURL(
    new RegExp(`/groups/${groupId}/history\\?limit=1$`),
  );
  await memberPage.screenshot({
    path: testInfo.outputPath("sync-history.png"),
    fullPage: true,
  });
});
