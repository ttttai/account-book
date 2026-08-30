import { describe, expect, it } from "vitest";

import {
  RESTORE_WINDOW_DAYS,
  isWithinRestoreWindow,
  restoreDeadline,
} from "./restore-window";

describe("restore-window", () => {
  it("復元期限は削除日時から30日後である", () => {
    expect(RESTORE_WINDOW_DAYS).toBe(30);
    expect(restoreDeadline("2026-08-01T00:00:00.000Z").toISOString()).toBe(
      "2026-08-31T00:00:00.000Z",
    );
  });

  it("削除から30日以内は復元可能と判定する", () => {
    const deletedAt = "2026-08-01T12:00:00.000Z";
    expect(
      isWithinRestoreWindow(deletedAt, new Date("2026-08-31T11:59:59.000Z")),
    ).toBe(true);
  });

  it("復元期限ちょうどを過ぎたら復元不可と判定する", () => {
    const deletedAt = "2026-08-01T12:00:00.000Z";
    expect(
      isWithinRestoreWindow(deletedAt, new Date("2026-08-31T12:00:00.000Z")),
    ).toBe(false);
    expect(
      isWithinRestoreWindow(deletedAt, new Date("2026-09-15T00:00:00.000Z")),
    ).toBe(false);
  });
});
