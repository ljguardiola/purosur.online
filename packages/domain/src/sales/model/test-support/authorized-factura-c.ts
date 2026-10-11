import type { AuthorizedFacturaC } from "../../../fiscal/index.js";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../../../fiscal/test-support/fictional-tax-identities.js";

export function authorizedFacturaC(total: number): AuthorizedFacturaC {
  return {
    pointOfSale: 1,
    number: 123,
    issuedOn: "2026-10-07",
    authorizationCode: "71234567890123",
    authorizationCodeDueOn: "2026-10-17",
    document: {
      invoiceClass: "C",
      total,
      netAmount: total,
      vatAmount: 0,
      issuer: {
        legalName: FICTIONAL_LEGAL_NAME,
        cuit: FICTIONAL_CUIT,
        taxStatus: "Responsable Monotributo",
        grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
        activityStartDate: "2020-01-15",
        version: 3,
      },
      buyerTaxStatusCode: 5,
      buyerTaxStatusDescription: "Consumidor Final",
    },
  };
}
