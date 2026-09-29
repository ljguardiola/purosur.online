import { type CalendarDate, parseDate } from "@internationalized/date";
import { ARGENTINA_TIME_ZONE, argentinaCalendarDay } from "@purosur/domain";
import { formatDate } from "@purosur/ui";

export type CountMoment = { day: CalendarDate | null; time: string };

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Argentina has kept UTC−3 all year, with no daylight saving time, since 2009.
const ARGENTINA_OFFSET = "-03:00";

export function countMomentNow(now: Date): { day: CalendarDate; time: string } {
  return {
    day: parseDate(argentinaCalendarDay(now)),
    time: formatDate(now, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
      timeZone: ARGENTINA_TIME_ZONE,
    }),
  };
}

export function countMomentInstant({ day, time }: CountMoment): string | undefined {
  if (day === null || !TIME_PATTERN.test(time)) {
    return undefined;
  }
  return `${day.toString()}T${time}:00${ARGENTINA_OFFSET}`;
}
