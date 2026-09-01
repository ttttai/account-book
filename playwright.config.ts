import { defineConfig, devices } from "@playwright/test";

import { getE2eEnvironment } from "./tests/e2e/support/e2e-environment";

// 設定読み込み時にloopback以外のstackを拒否する (NFR-E2E-002)
const environment = getE2eEnvironment();
const isContinuousIntegration = Boolean(process.env.CI);

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /.*\.spec\.ts/,
  fullyParallel: true,
  forbidOnly: isContinuousIntegration,
  retries: isContinuousIntegration ? 1 : 0,
  workers: isContinuousIntegration ? 2 : undefined,
  // next devは初回requestでrouteをcompileするため、smoke flowへ余裕を持たせる
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: isContinuousIntegration
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: environment.baseUrl,
    actionTimeout: 20_000,
    navigationTimeout: 60_000,
    locale: "ja-JP",
    timezoneId: "Asia/Tokyo",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      // 主要viewportはスマートフォン基準の375 x 812とする (NFR-E2E-004)
      name: "mobile",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 375, height: 812 },
        hasTouch: true,
      },
    },
    {
      // 1280 x 800ではレイアウト回帰の検出だけを担当する
      name: "desktop",
      grep: /@desktop/,
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 800 },
      },
    },
  ],
});
