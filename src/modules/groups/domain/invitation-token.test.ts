import { describe, expect, it } from "vitest";

import {
  buildInvitationShareUrl,
  hashInvitationToken,
} from "./invitation-token";

const TOKEN = "A".repeat(43);

describe("招待token (AC-GRP-004-2, AC-GRP-004-7, AC-GRP-004-8)", () => {
  it("生tokenを決定的なSHA-256小文字hexへ変換する", async () => {
    await expect(hashInvitationToken(TOKEN)).resolves.toBe(
      "0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a",
    );
  });

  it("共有linkのfragmentだけに生tokenを格納する", () => {
    const result = buildInvitationShareUrl("http://127.0.0.1:3000", TOKEN);
    const url = new URL(result ?? "invalid:");

    expect(url.pathname).toBe("/invitations/accept");
    expect(url.search).toBe("");
    expect(url.hash).toBe(`#token=${TOKEN}`);
  });

  it.each([
    "javascript:alert(1)",
    "http://user:password@127.0.0.1:3000",
    "http://127.0.0.1:3000/base-path",
    "http://127.0.0.1:3000?token=old",
  ])("危険または不正なsite URLを拒否する: %s", (siteUrl) => {
    expect(buildInvitationShareUrl(siteUrl, TOKEN)).toBeNull();
  });

  it("不正な生tokenでは共有linkを作らない", () => {
    expect(
      buildInvitationShareUrl("http://127.0.0.1:3000", "short"),
    ).toBeNull();
  });
});
