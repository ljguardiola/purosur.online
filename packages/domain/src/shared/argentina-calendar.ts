import { offsetAt, type ZoneRules } from "./zone-rules.js";

// The business operates only in Argentina, so "today" means Argentina's calendar day: the UTC
// day is already tomorrow after 21:00 local time.
export const ARGENTINA_TIME_ZONE = "America/Argentina/Buenos_Aires";

const MINUTE_MS = 60_000;

export function localClock(instant: Date, rules: ZoneRules): Date {
  return new Date(instant.getTime() + offsetAt(rules, instant) * MINUTE_MS);
}

export function argentinaCalendarDay(instant: Date, rules: ZoneRules): string {
  return localClock(instant, rules).toISOString().slice(0, 10);
}

export function utcOffsetText(offsetMinutes: number): string {
  const sign = offsetMinutes < 0 ? "-" : "+";
  const absolute = Math.abs(offsetMinutes);
  const hours = String(Math.floor(absolute / 60)).padStart(2, "0");
  const minutes = String(absolute % 60).padStart(2, "0");
  return `${sign}${hours}:${minutes}`;
}

export function argentinaInstant(day: string, time: string, rules: ZoneRules): string {
  const wallClock = Date.parse(`${day}T${time}:00Z`);
  const offsetReadingTheWallClockAt = (offsetMinutes: number) =>
    offsetAt(rules, new Date(wallClock - offsetMinutes * MINUTE_MS));
  const settled = offsetReadingTheWallClockAt(offsetAt(rules, new Date(wallClock)));
  // A wall-clock time a forward transition skips settles on neither offset; the smaller one is the
  // offset before the transition, which moves it forward past the gap instead of into the day before.
  const offset = Math.min(settled, offsetReadingTheWallClockAt(settled));
  return `${day}T${time}:00${utcOffsetText(offset)}`;
}
