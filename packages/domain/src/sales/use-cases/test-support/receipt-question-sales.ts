import { authorizedFacturaC } from "../../model/test-support/authorized-factura-c.js";
import { completedSale } from "./receipt-rig.js";

type IssuerIdentity = Parameters<typeof authorizedFacturaC>[1];

export function offlineAuthorized(issuer: IssuerIdentity) {
  return {
    pointOfSale: 7,
    number: 101,
    issuedOn: "2026-10-07",
    document: authorizedFacturaC(6750, issuer).document,
    offlineAuthorizationCode: "71234567890123",
    fortnight: { start: "2026-10-01", end: "2026-10-15" },
  };
}

export function saleWithFiscal(
  fiscal: ReturnType<typeof completedSale>["source"]["fiscal"],
  overrides: Parameters<typeof completedSale>[0] = {},
) {
  const sale = completedSale(overrides);
  return { ...sale, source: { ...sale.source, fiscal } };
}

export function authorizedSale(
  issuer: IssuerIdentity,
  overrides: Parameters<typeof completedSale>[0] = {},
) {
  return saleWithFiscal(
    { kind: "authorized", authorized: authorizedFacturaC(6750, issuer) },
    overrides,
  );
}
