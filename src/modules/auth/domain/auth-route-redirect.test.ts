import { describe, expect, it } from "vitest";

import { resolveAuthRouteRedirect } from "./auth-route-redirect";

describe("resolveAuthRouteRedirect", () => {
  it("未認証の保護画面要求を戻り先付きでログイン画面へ送る", () => {
    expect(
      resolveAuthRouteRedirect({
        pathname: "/groups/11111111-1111-4111-8111-111111111111",
        search: "?month=2026-08",
        isAuthenticated: false,
      }),
    ).toBe(
      "/login?next=%2Fgroups%2F11111111-1111-4111-8111-111111111111%3Fmonth%3D2026-08",
    );
    expect(
      resolveAuthRouteRedirect({
        pathname: "/app",
        search: "",
        isAuthenticated: false,
      }),
    ).toBe("/login?next=%2Fapp");
  });

  it("未認証の公開画面はredirectしない", () => {
    for (const pathname of ["/", "/login", "/invitations/accept"]) {
      expect(
        resolveAuthRouteRedirect({
          pathname,
          search: "",
          isAuthenticated: false,
        }),
      ).toBeNull();
    }
  });

  it("認証済みのstart_urlとログイン画面をホームへ送る", () => {
    expect(
      resolveAuthRouteRedirect({
        pathname: "/",
        search: "",
        isAuthenticated: true,
      }),
    ).toBe("/app");
    expect(
      resolveAuthRouteRedirect({
        pathname: "/login",
        search: "?next=%2Fapp",
        isAuthenticated: true,
      }),
    ).toBe("/app");
  });

  it("認証済みの保護画面と公開のsubpathはredirectしない", () => {
    for (const pathname of [
      "/app",
      "/groups/11111111-1111-4111-8111-111111111111",
      "/invitations/accept",
    ]) {
      expect(
        resolveAuthRouteRedirect({
          pathname,
          search: "",
          isAuthenticated: true,
        }),
      ).toBeNull();
    }
  });

  it("外部URLへ誘導する戻り先を既定の保護画面へ置き換える", () => {
    expect(
      resolveAuthRouteRedirect({
        pathname: "//attacker.example",
        search: "",
        isAuthenticated: false,
      }),
    ).toBeNull();
    expect(
      resolveAuthRouteRedirect({
        pathname: "/app",
        search: "?next=%2F%2Fattacker.example",
        isAuthenticated: false,
      }),
    ).toBe("/login?next=%2Fapp");
  });
});
