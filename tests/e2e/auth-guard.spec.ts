import { expect, test } from "./support/fixtures";

// 認証済みのホーム: 一覧の/app、または所属1件時に直行する/groups/{groupId}
const HOME_URL_PATTERN = /\/(?:app|groups\/[0-9a-f-]{36})(?:\?|$)/;

// E2E-001 未認証の保護画面アクセスとログイン導線（AUTH-004、AUTH-005、NFR-PWA-006）
test.describe("E2E-001 認証導線", () => {
  test("未認証で保護画面を開くと戻り先付きでログイン画面へ遷移する", async ({
    page,
  }) => {
    await page.goto("/app");

    await expect(page).toHaveURL(/\/login\?next=%2Fapp$/);
    await expect(
      page.getByRole("link", { name: "Googleでログイン" }),
    ).toBeVisible();
  });

  test("ログイン画面はGoogle以外の認証手段を表示しない", async ({ page }) => {
    await page.goto("/login");

    await expect(page.locator('input[type="password"]')).toHaveCount(0);
    await expect(page.locator('input[type="email"]')).toHaveCount(0);
    await expect(page.getByText("新規登録")).toHaveCount(0);
    await expect(page.getByText("パスワードをお忘れ")).toHaveCount(0);
  });

  test("旧認証routeはログイン画面へ転送する", async ({ page }) => {
    for (const path of [
      "/signup",
      "/forgot-password",
      "/account/update-password",
    ]) {
      await page.goto(path);
      await expect(page).toHaveURL(/\/login(\?|$)/);
    }
  });

  test("認証済みでstart_urlを開くとログイン導線を経由せずホームへ遷移する", async ({
    memberPage,
  }) => {
    await memberPage.goto("/");

    // ホームは所属件数により/app（一覧）または所属1件時の/groups/{id}（当月カレンダー）となる (AC-GRP-011-1, AC-GRP-011-2)
    await expect(memberPage).toHaveURL(HOME_URL_PATTERN);
    await expect(
      memberPage.getByRole("link", { name: "Googleでログイン" }),
    ).toHaveCount(0);
    // 一覧（プロフィール）またはカレンダー（グループ名）の見出しが表示される
    await expect(
      memberPage.getByRole("heading", { level: 1 }).first(),
    ).toBeVisible();
  });

  test("認証済みでログイン画面を開いてもGoogle認証を再実行しない", async ({
    memberPage,
  }) => {
    await memberPage.goto("/login");

    await expect(memberPage).toHaveURL(HOME_URL_PATTERN);
  });

  test("ログアウト後は保護画面へ戻れない", async ({ memberPage }) => {
    // ログアウトボタンは一覧画面にあるため、所属件数に左右されない一覧表示を開く (AC-GRP-011-3)
    await memberPage.goto("/app?view=groups");
    await memberPage.getByRole("button", { name: "ログアウト" }).click();
    await expect(memberPage).toHaveURL(/\/login(\?|$)/);

    await memberPage.goto("/app");
    await expect(memberPage).toHaveURL(/\/login\?next=%2Fapp$/);
  });
});
