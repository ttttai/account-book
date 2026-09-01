import { describe, expect, it } from "vitest";

import { formatRecurringJpy } from "./recurring-jpy";
import { formatCommandFailureLog } from "./recurring-command-log";

describe("formatRecurringJpy", () => {
  it("3桁区切りの円表記にする", () => {
    expect(formatRecurringJpy(0)).toBe("￥0");
    expect(formatRecurringJpy(100)).toBe("￥100");
    expect(formatRecurringJpy(1000)).toBe("￥1,000");
    expect(formatRecurringJpy(100000)).toBe("￥100,000");
    expect(formatRecurringJpy(1234567)).toBe("￥1,234,567");
  });

  it("負数と非整数を拒否する", () => {
    expect(() => formatRecurringJpy(-1)).toThrow();
    expect(() => formatRecurringJpy(1.5)).toThrow();
    expect(() => formatRecurringJpy(Number.NaN)).toThrow();
  });
});

describe("formatCommandFailureLog", () => {
  it("操作名とcodeだけを1行へ残す (NFR-OPS-008)", () => {
    expect(
      formatCommandFailureLog({
        operation: "updateRecurringTransaction",
        code: "40001",
      }),
    ).toBe(
      "recurring command failed: operation=updateRecurringTransaction code=40001",
    );
  });

  it("codeが無い場合はunknownとして記録する", () => {
    for (const code of [undefined, null, 400, {}, ""]) {
      expect(
        formatCommandFailureLog({ operation: "endRecurringTransaction", code }),
      ).toBe(
        "recurring command failed: operation=endRecurringTransaction code=unknown",
      );
    }
  });

  it("改行や任意の文字列を含むcodeを記録しない", () => {
    const injected = formatCommandFailureLog({
      operation: "createRecurringTransaction",
      code: "42501\nPROD_DB_URL=secret",
    });

    expect(injected).not.toContain("secret");
    expect(injected).not.toContain("\n");
    expect(injected).toContain("code=unknown");
  });
});
