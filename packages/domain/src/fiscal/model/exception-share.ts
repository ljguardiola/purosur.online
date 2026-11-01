import { lastDayOfMonth } from "../../shared/index.js";

const BREACH_DENOMINATOR = 20;
const TENTHS_OF_A_PERCENT = 1_000;
const MONTHS_IN_A_YEAR = 12;

export interface ExceptionShareCounts {
  exceptionCount: number;
  totalCount: number;
}

export interface RecordedExceptionShareBreach extends ExceptionShareCounts {
  fiscalAddressId: string;
  fiscalAddressName: string;
  month: string;
}

export const EXCEPTION_SHARE_MONTH_STATES = ["non_compliant", "compliant", "in_progress"] as const;

export type ExceptionShareMonthState = (typeof EXCEPTION_SHARE_MONTH_STATES)[number];

export function isExceptionShareBreach({ exceptionCount, totalCount }: ExceptionShareCounts) {
  return totalCount > 0 && exceptionCount * BREACH_DENOMINATOR >= totalCount;
}

export function exceptionShareTenthsOfPercent({
  exceptionCount,
  totalCount,
}: ExceptionShareCounts): number | null {
  return totalCount === 0 ? null : Math.floor((exceptionCount * TENTHS_OF_A_PERCENT) / totalCount);
}

export function monthOfDay(day: string): string {
  return day.slice(0, 7);
}

export function isMonthClosed(month: string, today: string): boolean {
  return today > lastDayOfMonth(`${month}-01`);
}

function monthsOfYear(year: number): string[] {
  return Array.from(
    { length: MONTHS_IN_A_YEAR },
    (_, index) => `${year}-${String(index + 1).padStart(2, "0")}`,
  );
}

export function monthsStartedInYear(year: number, today: string): string[] {
  const currentMonth = monthOfDay(today);
  return monthsOfYear(year).filter((month) => month <= currentMonth);
}

export interface ClosedMonthsWindow {
  from: string;
  through: string;
}

export function closedMonthsWindow(today: string): ClosedMonthsWindow {
  const year = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7));
  const throughYear = currentMonth === 1 ? year - 1 : year;
  const throughMonth = currentMonth === 1 ? MONTHS_IN_A_YEAR : currentMonth - 1;
  return {
    from: `${year - 1}-01`,
    through: `${throughYear}-${String(throughMonth).padStart(2, "0")}`,
  };
}

export function exceptionShareMonthState({
  counts,
  closed,
  recorded,
}: {
  counts: ExceptionShareCounts;
  closed: boolean;
  recorded: boolean;
}): ExceptionShareMonthState {
  if (recorded) {
    return "non_compliant";
  }
  if (!closed) {
    return "in_progress";
  }
  return isExceptionShareBreach(counts) ? "non_compliant" : "compliant";
}

export function nonCompliantMonthsOfYear(year: number, months: readonly string[]): string[] {
  const prefix = `${year}-`;
  return [...new Set(months.filter((month) => month.startsWith(prefix)))].sort();
}
