const MONTH_PATTERN = /^(\d{4})-(0[1-9]|1[0-2])$/;

export type ExportPeriod =
  | Readonly<{ kind: "all"; label: "all" }>
  | Readonly<{
      kind: "month";
      label: string;
      start: string;
      endExclusive: string;
    }>;

export type ExportPeriodResult =
  | Readonly<{ success: true; period: ExportPeriod }>
  | Readonly<{ success: false }>;

export function parseExportPeriod(
  unsafeMonth: string | null,
): ExportPeriodResult {
  if (unsafeMonth === null) {
    return { success: true, period: { kind: "all", label: "all" } };
  }

  const match = MONTH_PATTERN.exec(unsafeMonth);
  if (!match?.[1] || !match[2]) return { success: false };

  const year = Number(match[1]);
  const month = Number(match[2]);
  if (year < 1 || year > 9999) return { success: false };

  const nextYear = month === 12 ? year + 1 : year;
  const nextMonth = month === 12 ? 1 : month + 1;
  if (nextYear > 9999) return { success: false };

  const pad = (value: number, length: number) =>
    String(value).padStart(length, "0");
  return {
    success: true,
    period: {
      kind: "month",
      label: unsafeMonth,
      start: `${match[1]}-${match[2]}-01`,
      endExclusive: `${pad(nextYear, 4)}-${pad(nextMonth, 2)}-01`,
    },
  };
}
