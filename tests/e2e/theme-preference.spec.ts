import type { Page } from "@playwright/test";

import { createGroup } from "./support/app-actions";
import { expect, test } from "./support/fixtures";

const LIGHT_BACKGROUND = "rgb(247, 245, 239)";
const DARK_BACKGROUND = "rgb(21, 26, 23)";

function bodyBackground(page: Page): Promise<string> {
  return page.evaluate(() => getComputedStyle(document.body).backgroundColor);
}

function documentTheme(page: Page): Promise<string | null> {
  return page.evaluate(() =>
    document.documentElement.getAttribute("data-theme"),
  );
}

function themeColorMetas(page: Page): Promise<string[]> {
  return page.evaluate(() =>
    Array.from(document.querySelectorAll('meta[name="theme-color"]')).map(
      (meta) =>
        `${meta.getAttribute("media") ?? "-"}=${meta.getAttribute("content")}`,
    ),
  );
}

async function themeCookie(page: Page): Promise<string | undefined> {
  const cookies = await page.context().cookies();
  return cookies.find((cookie) => cookie.name === "theme")?.value;
}

// E2E-015 画面の配色の選択とOS設定への追従（NFR-UI-010、NFR-PWA-002）
test("E2E-015 設定画面の「画面の配色」でアプリだけをダーク・ライトへ固定し、「OSに従う」でOS設定へ戻る", async ({
  memberPage,
}) => {
  const groupId = await createGroup(memberPage, "E2E 画面の配色");
  const settingsPath = `/groups/${groupId}/settings`;

  // OSがライトのとき、既定はライトで data-theme は無い
  await memberPage.emulateMedia({ colorScheme: "light" });
  await memberPage.goto(settingsPath);
  const group = memberPage.getByRole("group", { name: "画面の配色" });
  await expect(group.getByRole("radio", { name: "OSに従う" })).toBeChecked();
  expect(await documentTheme(memberPage)).toBeNull();
  expect(await bodyBackground(memberPage)).toBe(LIGHT_BACKGROUND);

  // 「ダーク」を選ぶと遷移なしに同じ画面がダークになり、theme-colorも1件になる
  await group.getByText("ダーク", { exact: true }).click();
  await expect(group.getByRole("radio", { name: "ダーク" })).toBeChecked();
  await expect(memberPage).toHaveURL(new RegExp(`${settingsPath}$`));
  expect(await documentTheme(memberPage)).toBe("dark");
  expect(await bodyBackground(memberPage)).toBe(DARK_BACKGROUND);
  expect(await themeColorMetas(memberPage)).toEqual(["-=#151a17"]);
  expect(await themeCookie(memberPage)).toBe("dark");

  // 再読み込み後はサーバーの初回HTMLに data-theme="dark" が付き、ホームへ移動してもダークのまま
  await memberPage.reload();
  expect(await documentTheme(memberPage)).toBe("dark");
  expect(await bodyBackground(memberPage)).toBe(DARK_BACKGROUND);
  await memberPage.goto(`/groups/${groupId}`);
  await expect(
    memberPage.locator('main:not([aria-busy="true"])'),
  ).toBeVisible();
  expect(await bodyBackground(memberPage)).toBe(DARK_BACKGROUND);

  // OSがダークでも「ライト」を選ぶとライトに固定される
  await memberPage.emulateMedia({ colorScheme: "dark" });
  await memberPage.goto(settingsPath);
  await group.getByText("ライト", { exact: true }).click();
  await expect(group.getByRole("radio", { name: "ライト" })).toBeChecked();
  expect(await documentTheme(memberPage)).toBe("light");
  expect(await bodyBackground(memberPage)).toBe(LIGHT_BACKGROUND);
  expect(await themeColorMetas(memberPage)).toEqual(["-=#f7f5ef"]);

  // 「OSに従う」で属性とcookieが消え、OSの設定（dark）どおりへ戻る
  await group.getByText("OSに従う", { exact: true }).click();
  await expect(group.getByRole("radio", { name: "OSに従う" })).toBeChecked();
  expect(await documentTheme(memberPage)).toBeNull();
  expect(await bodyBackground(memberPage)).toBe(DARK_BACKGROUND);
  expect(await themeCookie(memberPage)).toBeUndefined();
  expect(await themeColorMetas(memberPage)).toEqual([
    "(prefers-color-scheme: light)=#f7f5ef",
    "(prefers-color-scheme: dark)=#151a17",
  ]);
});
