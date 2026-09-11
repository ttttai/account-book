import { describe, expect, it } from "vitest";

import { resolveAuthRouteRedirect } from "./auth-route-redirect";

const GROUP_PATH = "/groups/11111111-1111-4111-8111-111111111111";

describe("resolveAuthRouteRedirect", () => {
  it("未認証の保護画面要求を戻り先付きでログイン画面へ送る", () => {
    expect(
      resolveAuthRouteRedirect({
        pathname: GROUP_PATH,
        search: "?month=2026-08",
        authState: "unauthenticated",
      }),
    ).toBe(
      "/login?next=%2Fgroups%2F11111111-1111-4111-8111-111111111111%3Fmonth%3D2026-08",
    );
    expect(
      resolveAuthRouteRedirect({
        pathname: "/app",
        search: "",
        authState: "unauthenticated",
      }),
    ).toBe("/login?next=%2Fapp");
  });

  it("未認証の公開画面はredirectしない", () => {
    for (const pathname of ["/", "/login", "/invitations/accept"]) {
      expect(
        resolveAuthRouteRedirect({
          pathname,
          search: "",
          authState: "unauthenticated",
        }),
      ).toBeNull();
    }
  });

  it("認証済みのstart_urlとログイン画面をホームへ送る", () => {
    expect(
      resolveAuthRouteRedirect({
        pathname: "/",
        search: "",
        authState: "authenticated",
      }),
    ).toBe("/app");
    expect(
      resolveAuthRouteRedirect({
        pathname: "/login",
        search: "?next=%2Fapp",
        authState: "authenticated",
      }),
    ).toBe("/app");
  });

  it("認証済みの保護画面と公開のsubpathはredirectしない", () => {
    for (const pathname of ["/app", GROUP_PATH, "/invitations/accept"]) {
      expect(
        resolveAuthRouteRedirect({
          pathname,
          search: "",
          authState: "authenticated",
        }),
      ).toBeNull();
    }
  });

  it("認証状態が不明（バックエンド応答不能）なら、どのpathもredirectしない (AC-AUTH-004-4)", () => {
    for (const pathname of [
      "/",
      "/login",
      "/app",
      GROUP_PATH,
      "/invitations/accept",
    ]) {
      expect(
        resolveAuthRouteRedirect({
          pathname,
          search: "?month=2026-08",
          authState: "unavailable",
        }),
      ).toBeNull();
    }
  });

  it("外部URLへ誘導する戻り先を既定の保護画面へ置き換える", () => {
    expect(
      resolveAuthRouteRedirect({
        pathname: "//attacker.example",
        search: "",
        authState: "unauthenticated",
      }),
    ).toBeNull();
    expect(
      resolveAuthRouteRedirect({
        pathname: "/app",
        search: "?next=%2F%2Fattacker.example",
        authState: "unauthenticated",
      }),
    ).toBe("/login?next=%2Fapp");
  });
});
