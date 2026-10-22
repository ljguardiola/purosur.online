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

export interface ClockCorrectionReadings {
  previousReading: Date;
  correctedReading: Date;
}

export interface ClockCorrectionLapseInput {
  reading: Date;
  taxAuthorityLastIssuedOn: string | null;
  corrections: readonly ClockCorrectionReadings[];
}

export function isInClockCorrectionLapse({
  reading,
  taxAuthorityLastIssuedOn,
  corrections,
}: ClockCorrectionLapseInput): boolean {
  return (
    taxAuthorityLastIssuedOn !== null &&
    argentinaCalendarDay(reading) < taxAuthorityLastIssuedOn &&
    corrections.some(
      ({ previousReading, correctedReading }) =>
        argentinaCalendarDay(previousReading) >= taxAuthorityLastIssuedOn &&
        argentinaCalendarDay(correctedReading) < taxAuthorityLastIssuedOn,
    )
  );
}

export function raisedClockMark(mark: Date | null, reading: Date): Date {
  return mark === null ? reading : new Date(Math.max(mark.getTime(), reading.getTime()));
}
