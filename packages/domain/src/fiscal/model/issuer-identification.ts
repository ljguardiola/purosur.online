import { argentinaCalendarDay, codePointLength } from "../../shared/index.js";

export const ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH = 200;

// Ingresos Brutos registration format varies by province, so this is a generous bound rather
// than a pattern.
export const ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH = 100;

export function isIssuerIdentificationLegalNameTooLong(value: string): boolean {
  return codePointLength(value) > ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH;
}

export function isIssuerIdentificationGrossIncomeRegistrationTooLong(value: string): boolean {
  return codePointLength(value) > ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH;
}

const ACTIVITY_START_DATE_PATTERN = /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/;

// Rejects e.g. "2020-02-30", which `Date` would otherwise roll over instead of rejecting.
function isRealCalendarDate(year: number, month: number, day: number): boolean {
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

export function isIssuerIdentificationActivityStartDate(value: string, today: Date): boolean {
  const groups = ACTIVITY_START_DATE_PATTERN.exec(value)?.groups;
  if (!groups?.["year"] || !groups["month"] || !groups["day"]) {
    return false;
  }
  const { year, month, day } = groups;
  return (
    isRealCalendarDate(Number(year), Number(month), Number(day)) &&
    value <= argentinaCalendarDay(today)
  );
}
