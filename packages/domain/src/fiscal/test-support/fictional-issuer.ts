import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "./fictional-tax-identities.js";

export const FICTIONAL_ISSUER = {
  legalName: FICTIONAL_LEGAL_NAME,
  cuit: FICTIONAL_CUIT,
  taxStatus: "Responsable Monotributo",
  grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
  activityStartDate: "2020-01-15",
} as const;
