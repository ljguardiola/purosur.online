import { type CalendarDate, fromDate, toCalendarDate } from "@internationalized/date";
import { stockCountBodySchema, stockCountMomentSchema } from "@purosur/contracts";
import { formatDate } from "@purosur/ui";
import { schemaText } from "../platform/schema-text";

export type CountMoment = { day: CalendarDate | null; time: string };

export type CountStart = { day: CalendarDate; time: string; instant: string };

const TIME_ZONE = schemaText(stockCountBodySchema.shape.occurredAt.meta()?.["timeZone"]);

export function countMomentNow(now: Date): CountStart {
  return {
    day: toCalendarDate(fromDate(now, TIME_ZONE)),
    time: formatDate(now, {
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
      timeZone: TIME_ZONE,
    }),
    instant: now.toISOString(),
  };
}

export function countMomentInstant({ day, time }: CountMoment): string | undefined {
  if (day === null) {
    return undefined;
  }
  const moment = stockCountMomentSchema.safeParse({ day: day.toString(), time });
  return moment.success ? moment.data : undefined;
}

// Cutting an untouched default down to its minute would date the count before movements already
// registered earlier in that same minute, and undo them from what the count expects.
export function countOccurredAt(moment: CountMoment, start: CountStart): string | undefined {
  const untouched = moment.day?.compare(start.day) === 0 && moment.time === start.time;
  return untouched ? start.instant : countMomentInstant(moment);
}
