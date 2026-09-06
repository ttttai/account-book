import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import { verifyLineSignature } from "./line-signature";

const secret = "test-channel-secret";
const body = '{"events":[]}';
const validSignature = createHmac("sha256", secret)
  .update(body)
  .digest("base64");

describe("verifyLineSignature", () => {
  it("正しい署名を受理する (AC-NOTIF-005-1)", () => {
    expect(verifyLineSignature(secret, body, validSignature)).toBe(true);
  });

  it("署名が欠落した要求を拒否する", () => {
    expect(verifyLineSignature(secret, body, null)).toBe(false);
  });

  it("別のsecretで作られた署名を拒否する", () => {
    const forged = createHmac("sha256", "other-secret")
      .update(body)
      .digest("base64");
    expect(verifyLineSignature(secret, body, forged)).toBe(false);
  });

  it("本文が改ざんされた要求を拒否する", () => {
    expect(verifyLineSignature(secret, '{"events":[{}]}', validSignature)).toBe(
      false,
    );
  });

  it("base64として不正な署名を拒否する", () => {
    expect(verifyLineSignature(secret, body, "!!not-base64!!")).toBe(false);
  });
});
