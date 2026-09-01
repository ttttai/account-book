import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      // Next.jsが本番buildで解決する境界markerを、Application単体testでは空moduleへ置き換える
      "server-only": new URL("./tests/stubs/server-only.ts", import.meta.url)
        .pathname,
    },
  },
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: [],
    coverage: {
      provider: "istanbul",
      include: ["src/modules/**/*.{ts,tsx}"],
      exclude: [
        "src/modules/**/*.test.{ts,tsx}",
        "src/modules/**/*-types.ts",
        "src/modules/*/{index,server,presentation}.ts",
      ],
      reporter: ["text", "html", "json-summary"],
      thresholds: {
        statements: 50,
        branches: 50,
        functions: 50,
        lines: 50,
      },
    },
    // CSS Modulesのクラス名を変換せず、テストから元のクラス名で参照できるようにする
    css: {
      modules: {
        classNameStrategy: "non-scoped",
      },
    },
  },
});
