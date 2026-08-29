import { describe, expect, it } from "vitest";

import { resolveExpenseInitialDate } from "./expense-initial-date";

describe("resolveExpenseInitialDate", () => {
  const fallbackDate = "2026-08-28";

  it("カレンダーから渡された実在日を初期値にする", () => {
    expect(resolveExpenseInitialDate("2026-08-27", fallbackDate)).toBe(
      "2026-08-27",
    );
  });

  it.each([
    "2026-02-29",
    "2026-13-01",
    "0000-01-01",
    "2026-8-1",
    ["2026-08-27"],
    null,
  ])("不正な日付 %j はグループの今日へ戻す", (input) => {
    expect(resolveExpenseInitialDate(input, fallbackDate)).toBe(fallbackDate);
  });
});
