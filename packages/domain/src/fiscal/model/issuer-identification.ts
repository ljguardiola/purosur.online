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

export function isIssuerIdentificationActivityStartDate(value: string, today: Date): boolean {
  const [year, month, day] = value.split("-");
  // Date.UTC rolls an out-of-range day or month over (2020-02-30 becomes 2020-03-01) instead of
  // rejecting it.
  const date = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return (
    !Number.isNaN(date.getTime()) &&
    date.toISOString().slice(0, 10) === value &&
    value <= argentinaCalendarDay(today)
  );
}

export function latestIssuerIdentification<TVersion extends { version: number }>(
  versions: readonly TVersion[],
): TVersion | undefined {
  return [...versions].sort((a, b) => b.version - a.version)[0];
}
