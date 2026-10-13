import { argentinaCalendarDay } from "./argentina-calendar.js";
import { isCalendarDay } from "./calendar-day.js";

export interface ReportPeriod {
  from: string;
  to: string;
}

export function isReportPeriodAsked({
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

export function defaultReportPeriod(now: Date): ReportPeriod {
  const today = argentinaCalendarDay(now);
  return { from: today, to: today };
}
