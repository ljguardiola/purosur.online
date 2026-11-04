import { type ReportPeriod, shiftCalendarDay } from "../../shared/index.js";

export function daysEndingOn(today: string, days: number): ReportPeriod {
  return { from: shiftCalendarDay(today, 1 - days), to: today };
}
