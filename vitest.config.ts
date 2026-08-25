import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}", "tests/integration/**/*.test.{ts,tsx}"],
    setupFiles: [],
  },
});
