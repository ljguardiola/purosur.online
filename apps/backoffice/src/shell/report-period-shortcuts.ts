import { endOfMonth, startOfMonth } from "@internationalized/date";
import { calendarDateOf, dayOf } from "./report-day";

export type PeriodShortcut = "today" | "last-7-days" | "this-month" | "previous-month";

const PERIOD_SHORTCUTS: readonly PeriodShortcut[] = [
  "today",
  "last-7-days",
  "this-month",
  "previous-month",
];

type Period = { from: string; to: string };

export function periodOfShortcut(shortcut: PeriodShortcut, today: string): Period {
  const day = calendarDateOf(today);
  switch (shortcut) {
    case "today":
      return { from: today, to: today };
    case "last-7-days":
      return { from: dayOf(day.subtract({ days: 6 })), to: today };
    case "this-month":
      return { from: dayOf(startOfMonth(day)), to: today };
    case "previous-month": {
      const previousMonth = startOfMonth(day).subtract({ months: 1 });
      return { from: dayOf(previousMonth), to: dayOf(endOfMonth(previousMonth)) };
    }
  }
}

export function shortcutOfPeriod(period: Period, today: string): PeriodShortcut | null {
  return (
    PERIOD_SHORTCUTS.find((shortcut) => {
      const shortcutPeriod = periodOfShortcut(shortcut, today);
      return shortcutPeriod.from === period.from && shortcutPeriod.to === period.to;
    }) ?? null
  );
}
