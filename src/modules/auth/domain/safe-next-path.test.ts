import { describe, expect, it } from "vitest";

import { resolveSafeNextPath } from "./safe-next-path";

describe("ログイン後の安全な戻り先 (AC-AUTH-004-2)", () => {
  it.each(["/app", "/groups/123?month=2026-08", "/account/update-password"])(
    "同一originの相対pathを許可する: %s",
    (path) => {
      expect(resolveSafeNextPath(path)).toBe(path);
    },
  );

  it.each([
    undefined,
    null,
    "",
    "https://evil.example/path",
    "//evil.example/path",
    "/%2f%2fevil.example",
    "/\\evil.example",
    "/app\nSet-Cookie:bad=true",
    "app/without-leading-slash",
  ])("危険または不正な戻り先を標準pathへ置換する: %s", (path) => {
    expect(resolveSafeNextPath(path)).toBe("/app");
  });
});
