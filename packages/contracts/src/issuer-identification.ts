import { codePointLength } from "@purosur/domain";

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
