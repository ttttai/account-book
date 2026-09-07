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
  // E2E stackは本番buildで動くため、timeoutはcompile時間を含めず
  // 本番相当の応答時間を基準にした上限とする (15-e2e-testing.md §4)
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: isContinuousIntegration
    ? [["list"], ["html", { open: "never" }]]
    : [["list"]],
  use: {
    baseURL: environment.baseUrl,
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
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
