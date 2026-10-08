import { argentinaCalendarDay, isCalendarDay } from "../../shared/index.js";

export interface SalesReportRange {
  from: string;
  to: string;
}

export interface SalesOfDay {
  day: string;
  salesCount: number;
  total: number;
}

export interface SalesReportTotals {
  salesCount: number;
  total: number;
}

export function isSalesReportRangeAsked({
  from,
  to,
}: {
  from: string | undefined;
  to: string | undefined;
}): boolean {
  if (from === undefined || to === undefined) {
    return from === to;
  }
  return isCalendarDay(from) && isCalendarDay(to) && from <= to;
}

export function defaultSalesReportRange(now: Date): SalesReportRange {
  const today = argentinaCalendarDay(now);
  return { from: today, to: today };
}

export function salesReportTotals(days: readonly SalesOfDay[]): SalesReportTotals {
  return {
    salesCount: days.reduce((sum, day) => sum + day.salesCount, 0),
    total: days.reduce((sum, day) => sum + day.total, 0),
  };
}
