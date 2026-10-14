import {
  isCalendarDay,
  type ReportPeriod,
  roundHalfUp,
  shiftCalendarDay,
} from "../../shared/index.js";
import { averageTicket } from "./average-ticket.js";
import { type SalesOfDay, salesReportTotals } from "./sales-report.js";

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

export function previousReportPeriod(range: ReportPeriod): ReportPeriod | null {
  const from = shiftCalendarDay(range.from, -dayCountOf(range));
  return isCalendarDay(from) ? { from, to: shiftCalendarDay(range.from, -1) } : null;
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
  if (salesReportTotals(days).salesCount === 0) {
    return weeks;
  }
  let to = range.to;
  for (let remaining = dayCountOf(range); remaining > 0; remaining -= DAYS_PER_WEEK) {
    const from = shiftCalendarDay(to, 1 - Math.min(DAYS_PER_WEEK, remaining));
    const totals = salesReportTotals(days.filter((day) => day.day >= from && day.day <= to));
    weeks.push({ from, to, ...totals, averageTicket: averageTicket(totals) });
    to = shiftCalendarDay(to, -DAYS_PER_WEEK);
  }
  return weeks;
}
