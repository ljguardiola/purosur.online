import { argentinaCalendarDay } from "./argentina-calendar.js";
import { isCalendarDay, shiftCalendarDay } from "./calendar-day.js";
import type { ZoneRules } from "./zone-rules.js";

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

export function defaultReportPeriod(now: Date, rules: ZoneRules): ReportPeriod {
  const today = argentinaCalendarDay(now, rules);
  return { from: today, to: today };
}

export function trailingReportPeriod(now: Date, rules: ZoneRules, days: number): ReportPeriod {
  const to = argentinaCalendarDay(now, rules);
  return { from: shiftCalendarDay(to, -(days - 1)), to };
}

export function reportPeriodOf(
  { from, to }: { from: string | undefined; to: string | undefined },
  now: Date,
  rules: ZoneRules,
): ReportPeriod {
  return from !== undefined && to !== undefined ? { from, to } : defaultReportPeriod(now, rules);
}
