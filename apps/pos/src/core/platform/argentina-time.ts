import { offsetAt, utcOffsetText, type ZoneRules } from "@purosur/domain";

const MINUTE_MS = 60_000;

// The fields of the returned date, read in UTC, are the wall clock of the instant under the rules.
export function argentinaWallClock(instant: Date, rules: ZoneRules): Date {
  return new Date(instant.getTime() + offsetAt(rules, instant) * MINUTE_MS);
}

export function inArgentinaTime(instant: Date, rules: ZoneRules): string {
  const clock = argentinaWallClock(instant, rules).toISOString().slice(0, -1);
  return `${clock}${utcOffsetText(offsetAt(rules, instant))}`;
}
