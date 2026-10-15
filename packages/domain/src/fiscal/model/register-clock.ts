import { argentinaCalendarDay } from "../../shared/index.js";

export const REGISTER_CLOCK_TOLERANCE_MS = 60_000;

export function isBehindClockMark(reading: Date, mark: Date | null): boolean {
  return mark !== null && reading.getTime() < mark.getTime() - REGISTER_CLOCK_TOLERANCE_MS;
}

export function isBeforeTaxAuthorityLastIssuedDay(
  reading: Date,
  lastIssuedOn: string | null,
): boolean {
  return lastIssuedOn !== null && argentinaCalendarDay(reading) < lastIssuedOn;
}

export function raisedClockMark(mark: Date | null, reading: Date): Date {
  return mark !== null && mark.getTime() > reading.getTime() ? mark : reading;
}
