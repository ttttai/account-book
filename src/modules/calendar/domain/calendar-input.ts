import { z } from "zod";

export type CalendarScope = "group" | "self" | "member";

export type CalendarSelection = Readonly<{
  month: string;
  scope: CalendarScope;
  memberId?: string;
  day?: string;
}>;

export type CalendarSelectionResult =
  | Readonly<{ success: true; value: CalendarSelection }>
  | Readonly<{
      success: false;
      reason:
        "invalid_month" | "invalid_scope" | "invalid_member" | "invalid_day";
    }>;

type CalendarSearchInput = Readonly<{
  month?: unknown;
  scope?: unknown;
  member?: unknown;
  day?: unknown;
}>;

const uuidSchema = z.uuid();

function isLeapYear(year: number): boolean {
  return year % 400 === 0 || (year % 4 === 0 && year % 100 !== 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isCanonicalMonth(value: string): boolean {
  const match = /^(\d{4})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  return year >= 1 && month >= 1 && month <= 12;
}

function isDayInMonth(value: string, monthValue: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match || value.slice(0, 7) !== monthValue) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  return day >= 1 && day <= daysInMonth(year, month);
}

function optionalString(value: unknown): string | undefined | null {
  if (value === undefined) return undefined;
  return typeof value === "string" ? value : null;
}

export function parseCalendarSelection(
  input: CalendarSearchInput,
  currentMonth: string,
): CalendarSelectionResult {
  const monthValue = optionalString(input.month);
  if (monthValue === null) return { success: false, reason: "invalid_month" };
  const month = monthValue ?? currentMonth;
  if (!isCanonicalMonth(month)) {
    return { success: false, reason: "invalid_month" };
  }

  const scopeValue = optionalString(input.scope);
  if (scopeValue === null) return { success: false, reason: "invalid_scope" };
  const scope = scopeValue ?? "group";
  if (
    !(["group", "self", "member"] as const).includes(scope as CalendarScope)
  ) {
    return { success: false, reason: "invalid_scope" };
  }

  const member = optionalString(input.member);
  if (member === null) return { success: false, reason: "invalid_member" };
  if (scope === "member") {
    if (!member || !uuidSchema.safeParse(member).success) {
      return { success: false, reason: "invalid_member" };
    }
  } else if (member !== undefined) {
    return { success: false, reason: "invalid_member" };
  }

  const day = optionalString(input.day);
  if (day === null || (day !== undefined && !isDayInMonth(day, month))) {
    return { success: false, reason: "invalid_day" };
  }

  return {
    success: true,
    value: {
      month,
      scope: scope as CalendarScope,
      ...(scope === "member" ? { memberId: member } : {}),
      ...(day === undefined ? {} : { day }),
    },
  };
}
