import { argentinaCalendarDay, codePointLength, isCalendarDay } from "../../shared/index.js";

export const ISSUER_TAX_STATUS = "Responsable Monotributo";

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
  return isCalendarDay(value) && value <= argentinaCalendarDay(today);
}

export function latestIssuerIdentification<TVersion extends { version: number }>(
  versions: readonly TVersion[],
): TVersion | undefined {
  return [...versions].sort((a, b) => b.version - a.version)[0];
}
