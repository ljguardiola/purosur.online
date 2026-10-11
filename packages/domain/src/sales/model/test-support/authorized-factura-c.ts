import type { AuthorizedFacturaC } from "../../../fiscal/index.js";

export interface IssuerIdentity {
  legalName: string;
  cuit: string;
  grossIncomeRegistration: string;
}

export function authorizedFacturaC(total: number, identity: IssuerIdentity): AuthorizedFacturaC {
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
        ...identity,
        taxStatus: "Responsable Monotributo",
        activityStartDate: "2020-01-15",
        version: 3,
      },
      buyerTaxStatusCode: 5,
      buyerTaxStatusDescription: "Consumidor Final",
    },
  };
}
