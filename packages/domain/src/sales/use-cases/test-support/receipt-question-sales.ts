import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../../../fiscal/test-support/fictional-tax-identities.js";
import { authorizedFacturaC } from "../../model/test-support/authorized-factura-c.js";
import { completedSale } from "./receipt-rig.js";

const AUTHORIZED = authorizedFacturaC(6750, {
  legalName: FICTIONAL_LEGAL_NAME,
  cuit: FICTIONAL_CUIT,
  grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
});

export const OFFLINE_AUTHORIZED = {
  pointOfSale: 7,
  number: 101,
  issuedOn: "2026-10-07",
  document: AUTHORIZED.document,
  offlineAuthorizationCode: "71234567890123",
  fortnight: { start: "2026-10-01", end: "2026-10-15" },
};

export function saleWithFiscal(
  fiscal: ReturnType<typeof completedSale>["source"]["fiscal"],
  overrides: Parameters<typeof completedSale>[0] = {},
) {
  const sale = completedSale(overrides);
  return { ...sale, source: { ...sale.source, fiscal } };
}

export function authorizedSale(overrides: Parameters<typeof completedSale>[0] = {}) {
  return saleWithFiscal({ kind: "authorized", authorized: AUTHORIZED }, overrides);
}
