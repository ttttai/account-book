import { describe, expect, it } from "vitest";

import { formatCommandFailureLog } from "./command-failure-log";

describe("formatCommandFailureLog", () => {
  it("操作名とcodeだけを1行へ残す", () => {
    expect(
      formatCommandFailureLog({
        operation: "updateExpense",
        code: "PGRST202",
      }),
    ).toBe("transaction command failed: operation=updateExpense code=PGRST202");
  });

  it("codeが無い場合はunknownとして記録する", () => {
    for (const code of [undefined, null, 400, {}, ""]) {
      expect(
        formatCommandFailureLog({ operation: "deleteTransaction", code }),
      ).toBe(
        "transaction command failed: operation=deleteTransaction code=unknown",
      );
    }
  });

  it("改行や任意の文字列を含むcodeを記録しない", () => {
    const injected = formatCommandFailureLog({
      operation: "updateExpense",
      code: "40001\naccess_token=secret",
    });

    expect(injected).toBe(
      "transaction command failed: operation=updateExpense code=unknown",
    );
    expect(injected).not.toContain("secret");
    expect(injected).not.toContain("\n");
  });
});
