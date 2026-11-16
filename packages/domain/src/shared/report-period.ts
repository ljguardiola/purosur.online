import { argentinaCalendarDay } from "./argentina-calendar.js";
import { isCalendarDay } from "./calendar-day.js";
import type { ZoneRules } from "./zone-rules.js";

export interface ReportPeriod {
  from: string;
  to: string;
}

export interface AnsweredReportPeriod extends ReportPeriod {
  today: string;
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

export function defaultReportPeriod(now: Date, rules: ZoneRules): ReportPeriod {
  const today = argentinaCalendarDay(now, rules);
  return { from: today, to: today };
}

export function reportPeriodOf(
  { from, to }: { from: string | undefined; to: string | undefined },
  now: Date,
  rules: ZoneRules,
): AnsweredReportPeriod {
  const today = argentinaCalendarDay(now, rules);
  return from !== undefined && to !== undefined
    ? { from, to, today }
    : { ...defaultReportPeriod(now, rules), today };
}
