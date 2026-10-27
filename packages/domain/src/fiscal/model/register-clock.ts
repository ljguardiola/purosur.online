import { argentinaCalendarDay, type ZoneRules } from "../../shared/index.js";

export const REGISTER_CLOCK_TOLERANCE_MS = 60_000;

export function isBehindClockMark(reading: Date, mark: Date | null): boolean {
  return mark !== null && reading.getTime() < mark.getTime() - REGISTER_CLOCK_TOLERANCE_MS;
}

export function isBeforeTaxAuthorityLastIssuedDay(
  reading: Date,
  lastIssuedOn: string | null,
  rules: ZoneRules,
): boolean {
  return lastIssuedOn !== null && argentinaCalendarDay(reading, rules) < lastIssuedOn;
}

export interface ClockCorrectionReadings {
  previousReading: Date;
  correctedReading: Date;
}

export interface ClockCorrectionLapseInput {
  reading: Date;
  taxAuthorityLastIssuedOn: string | null;
  corrections: readonly ClockCorrectionReadings[];
}

export function isInClockCorrectionLapse(
  { reading, taxAuthorityLastIssuedOn, corrections }: ClockCorrectionLapseInput,
  rules: ZoneRules,
): boolean {
  return (
    taxAuthorityLastIssuedOn !== null &&
    argentinaCalendarDay(reading, rules) < taxAuthorityLastIssuedOn &&
    corrections.some(
      ({ previousReading, correctedReading }) =>
        argentinaCalendarDay(previousReading, rules) >= taxAuthorityLastIssuedOn &&
        argentinaCalendarDay(correctedReading, rules) < taxAuthorityLastIssuedOn,
    )
  );
}

export function raisedClockMark(mark: Date | null, reading: Date): Date {
  return mark === null ? reading : new Date(Math.max(mark.getTime(), reading.getTime()));
}
