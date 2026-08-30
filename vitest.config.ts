import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: [],
    // CSS Modulesのクラス名を変換せず、テストから元のクラス名で参照できるようにする
    css: {
      modules: {
        classNameStrategy: "non-scoped",
      },
    },
  },
});
