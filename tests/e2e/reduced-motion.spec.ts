import type { Locator, Page } from "@playwright/test";

import {
  createGroup,
  currentMonthInGroupTimezone,
  openCalendar,
} from "./support/app-actions";
import { expect, test } from "./support/fixtures";

type MotionStyle = Readonly<{
  animationName: string;
  animationDuration: string;
  transitionProperty: string;
  transitionDuration: string;
}>;

// 要素に効いているanimation・transitionの計算値を読む
function readMotion(locator: Locator): Promise<MotionStyle> {
  return locator.evaluate((element) => {
    const style = window.getComputedStyle(element);
    return {
      animationName: style.animationName,
      animationDuration: style.animationDuration,
      transitionProperty: style.transitionProperty,
      transitionDuration: style.transitionDuration,
    };
  });
}

// "0.18s" / "180ms" のような計算値の先頭の時間をmsへ変換する
function durationInMs(value: string): number {
  const first = value.split(",")[0]?.trim() ?? "";
  if (first.endsWith("ms")) return Number.parseFloat(first);
  return Number.parseFloat(first) * 1000;
}

function dayPanel(page: Page): Locator {
  return page.locator('aside[aria-labelledby="selected-day-title"]');
}

function inputDock(page: Page): Locator {
  return page.locator("[data-keypad-open]");
}

// E2E-013 reduced motionでのmotion無効化（NFR-A11Y-007、NFR-UI-009）
test("E2E-013 reduced motionではsheet・入力ドック・下部ナビのmotionが無効になり、通常設定では200ms以下のmotionが付く", async ({
  memberPage,
}) => {
  const groupId = await createGroup(memberPage, "E2E reduced motion");
  const month = currentMonthInGroupTimezone();
  const day = `${month}-15`;

  // reduced motion: sheet・ドック・下部ナビのanimation/transitionが無効になる
  await memberPage.emulateMedia({ reducedMotion: "reduce" });
  await openCalendar(memberPage, groupId, { month, scope: "group" });
  await memberPage.getByRole("link", { name: /15日、/ }).click();
  await expect(memberPage).toHaveURL(new RegExp(`day=${day}`));
  await expect(dayPanel(memberPage)).toBeVisible();

  const reducedPanel = await readMotion(dayPanel(memberPage));
  expect(reducedPanel.animationName).toBe("none");
  expect(durationInMs(reducedPanel.transitionDuration)).toBe(0);

  const homeLink = memberPage
    .getByRole("navigation")
    .getByRole("link", { name: "ホーム", exact: true });
  expect(durationInMs((await readMotion(homeLink)).transitionDuration)).toBe(0);

  // 「閉じる」は退場のmotionを待たず、その時点でsheetを取り除く
  await memberPage.getByRole("link", { name: "日別取引を閉じる" }).click();
  expect(await dayPanel(memberPage).count()).toBe(0);
  await expect(memberPage).not.toHaveURL(/day=/);

  await memberPage.goto(`/groups/${groupId}/transactions/new`);
  await expect(inputDock(memberPage)).toBeVisible();
  const reducedDock = await readMotion(inputDock(memberPage));
  expect(durationInMs(reducedDock.transitionDuration)).toBe(0);

  // 通常設定: sheetにスライドが付き、ドックの高さのtransitionは0sを超え200ms以下
  await memberPage.emulateMedia({ reducedMotion: "no-preference" });
  const normalDock = await readMotion(inputDock(memberPage));
  expect(normalDock.transitionProperty).toContain("height");
  expect(durationInMs(normalDock.transitionDuration)).toBeGreaterThan(0);
  expect(durationInMs(normalDock.transitionDuration)).toBeLessThanOrEqual(200);

  await openCalendar(memberPage, groupId, { month, scope: "group", day });
  await expect(dayPanel(memberPage)).toBeVisible();
  const normalPanel = await readMotion(dayPanel(memberPage));
  // CSS Modulesは本番buildでkeyframes名にもhashを付けるため、末尾一致で確認する
  expect(normalPanel.animationName).toMatch(/calendar-sheet-in$/);
  expect(durationInMs(normalPanel.animationDuration)).toBeGreaterThan(0);
  expect(durationInMs(normalPanel.animationDuration)).toBeLessThanOrEqual(200);

  // 閉じる操作の時点でURLとfocusは確定し、sheetは退場中だけaria-hiddenで残ってから消える
  await memberPage.getByRole("link", { name: "日別取引を閉じる" }).click();
  await expect(memberPage).not.toHaveURL(/day=/);
  await expect(memberPage.getByRole("complementary")).toHaveCount(0);
  await expect(dayPanel(memberPage)).toHaveCount(0);
});
