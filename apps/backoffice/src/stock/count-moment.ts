import { type CalendarDate, parseDate } from "@internationalized/date";
import { ARGENTINA_TIME_ZONE, argentinaCalendarDay } from "@purosur/domain";
import { formatDate } from "@purosur/ui";

export type CountMoment = { day: CalendarDate | null; time: string };

export type CountStart = { day: CalendarDate; time: string; instant: string };

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

// Argentina has kept UTC−3 all year, with no daylight saving time, since 2009.
const ARGENTINA_OFFSET = "-03:00";

export function countMomentNow(now: Date): CountStart {
  return {
    day: parseDate(argentinaCalendarDay(now)),
    time: formatDate(now, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: ARGENTINA_TIME_ZONE,
    }),
    instant: now.toISOString(),
  };
}

export function countMomentInstant({ day, time }: CountMoment): string | undefined {
  if (day === null || !TIME_PATTERN.test(time)) {
    return undefined;
  }
  return `${day.toString()}T${time}:00${ARGENTINA_OFFSET}`;
}

// Cutting an untouched default down to its minute would date the count before movements already
// registered earlier in that same minute, and undo them from what the count expects.
export function countOccurredAt(moment: CountMoment, start: CountStart): string | undefined {
  const untouched = moment.day?.compare(start.day) === 0 && moment.time === start.time;
  return untouched ? start.instant : countMomentInstant(moment);
}
