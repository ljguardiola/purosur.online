import { type ReportPeriod, roundHalfUp, shiftCalendarDay } from "../../shared/index.js";
import { averageTicket } from "./average-ticket.js";
import type { SalesOfDay } from "./sales-report.js";

const DAYS_PER_WEEK = 7;
const TENTHS_OF_A_PERCENT = 1_000n;
const DAY_MS = 24 * 60 * 60 * 1000;

export interface SalesOfWeek extends ReportPeriod {
  salesCount: number;
  total: number;
  averageTicket: number | null;
}

function dayCountOf({ from, to }: ReportPeriod): number {
  return (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
}

export function previousReportPeriod(range: ReportPeriod): ReportPeriod {
  return {
    from: shiftCalendarDay(range.from, -dayCountOf(range)),
    to: shiftCalendarDay(range.from, -1),
  };
}

export function ticketChangeTenths({
  current,
  previous,
}: {
  current: number | null;
  previous: number | null;
}): number | null {
  if (current === null || previous === null || previous === 0) {
    return null;
  }
  return roundHalfUp({
    numerator: BigInt(current - previous) * TENTHS_OF_A_PERCENT,
    denominator: BigInt(previous),
  });
}

export function salesOfWeeks(range: ReportPeriod, days: readonly SalesOfDay[]): SalesOfWeek[] {
  const weeks: SalesOfWeek[] = [];
  for (let to = range.to; to >= range.from; to = shiftCalendarDay(to, -DAYS_PER_WEEK)) {
    const earliest = shiftCalendarDay(to, 1 - DAYS_PER_WEEK);
    const from = earliest < range.from ? range.from : earliest;
    const inWeek = days.filter((day) => day.day >= from && day.day <= to);
    const salesCount = inWeek.reduce((sum, day) => sum + day.salesCount, 0);
    const total = inWeek.reduce((sum, day) => sum + day.total, 0);
    weeks.push({
      from,
      to,
      salesCount,
      total,
      averageTicket: averageTicket({ total, salesCount }),
    });
  }
  return weeks;
}
