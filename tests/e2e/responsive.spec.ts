import type { Page } from "@playwright/test";

import { createGroup } from "./support/app-actions";
import { expect, test } from "./support/fixtures";

const MINIMUM_WIDTH = 320;

// loading境界のmainと入れ替わる前に測らないよう、確定後のmainを待つ
function settledMain(page: Page) {
  return page.locator('main:not([aria-busy="true"])');
}

async function hasHorizontalOverflow(page: Page): Promise<boolean> {
  return page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth > root.clientWidth;
  });
}

// E2E-008 320pxでの横スクロール不発生（NFR-UI-002）
test("E2E-008 幅320pxで主要画面が横スクロールを発生させない", async ({
  memberPage,
}) => {
  const groupId = await createGroup(memberPage, "E2E 最小幅");
  await memberPage.setViewportSize({ width: MINIMUM_WIDTH, height: 812 });

  for (const path of [
    `/groups/${groupId}`,
    `/groups/${groupId}/history`,
    `/groups/${groupId}/transactions/new`,
    `/groups/${groupId}/settings`,
    `/groups/${groupId}/members`,
    `/groups/${groupId}/categories`,
  ]) {
    await memberPage.goto(path);
    await expect(settledMain(memberPage)).toBeVisible();
    expect(
      await hasHorizontalOverflow(memberPage),
      `${path}で横スクロールが発生しています`,
    ).toBe(false);
  }
});

// 1280 x 800でも同じ情報構造を保ち、横スクロールを発生させない（NFR-UI-006）
test("主要画面が1280pxでも横スクロールを発生させない @desktop", async ({
  memberPage,
}) => {
  const groupId = await createGroup(memberPage, "E2E PC幅");

  for (const path of [
    `/groups/${groupId}`,
    `/groups/${groupId}/history`,
    `/groups/${groupId}/transactions/new`,
    `/groups/${groupId}/settings`,
  ]) {
    await memberPage.goto(path);
    await expect(settledMain(memberPage)).toBeVisible();
    expect(
      await hasHorizontalOverflow(memberPage),
      `${path}で横スクロールが発生しています`,
    ).toBe(false);
  }
});
