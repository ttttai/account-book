import { describe, expect, it } from "vitest";

import { inferAllocationMethod } from "./allocation-method-inference";

describe("inferAllocationMethod", () => {
  it("負担行が1件で全額なら「1人」と判定する", () => {
    expect(
      inferAllocationMethod(3000, [{ memberId: "m-1", amountMinor: 3000 }]),
    ).toBe("single");
  });

  it("均等配分の結果と一致する負担は「均等」と判定する", () => {
    expect(
      inferAllocationMethod(6000, [
        { memberId: "m-1", amountMinor: 3000 },
        { memberId: "m-2", amountMinor: 3000 },
      ]),
    ).toBe("equal");
  });

  it("端数を含む均等配分（memberId昇順の先頭へ1円上乗せ）も「均等」と判定する", () => {
    expect(
      inferAllocationMethod(1001, [
        { memberId: "a-first", amountMinor: 501 },
        { memberId: "b-second", amountMinor: 500 },
      ]),
    ).toBe("equal");
  });

  it("均等配分と一致しない負担は「カスタム」と判定する", () => {
    expect(
      inferAllocationMethod(6000, [
        { memberId: "m-1", amountMinor: 4000 },
        { memberId: "m-2", amountMinor: 2000 },
      ]),
    ).toBe("custom");
  });

  it("端数の上乗せ先が昇順先頭と異なる場合は「カスタム」と判定する", () => {
    expect(
      inferAllocationMethod(1001, [
        { memberId: "a-first", amountMinor: 500 },
        { memberId: "b-second", amountMinor: 501 },
      ]),
    ).toBe("custom");
  });

  it("負担行が空・合計不一致など解釈不能な場合は「カスタム」へ安全に倒す", () => {
    expect(inferAllocationMethod(1000, [])).toBe("custom");
    expect(
      inferAllocationMethod(1000, [{ memberId: "m-1", amountMinor: 999 }]),
    ).toBe("custom");
  });
});
