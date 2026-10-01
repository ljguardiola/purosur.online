import { describe, expect, it } from "vitest";
import { fiscalAuthorizationAfter } from "./fiscal-authorization.js";
import type { PreEmissionGateOutcome } from "./pre-emission-gate.js";

const PASSED: PreEmissionGateOutcome = {
  kind: "passed",
  document: {
    invoiceClass: "C",
    total: 100,
    netAmount: 100,
    vatAmount: 0,
    issuer: {
      legalName: "Comercio de Prueba",
      cuit: "20000000000",
      taxStatus: "Condicion de prueba",
      grossIncomeRegistration: "901-000000-0",
      activityStartDate: "2020-01-15",
      version: 1,
    },
    buyerTaxStatusCode: 90,
  },
};

describe("fiscalAuthorizationAfter", () => {
  it("is authorized before any sale was evaluated", () => {
    expect(fiscalAuthorizationAfter(undefined)).toStrictEqual({ kind: "authorized" });
  });

  it("is authorized while the latest evaluation passed", () => {
    expect(fiscalAuthorizationAfter(PASSED)).toStrictEqual({ kind: "authorized" });
  });

  it("is stopped, with the reason, while the latest evaluation failed", () => {
    expect(
      fiscalAuthorizationAfter({ kind: "failed", reason: "legal_name_missing" }),
    ).toStrictEqual({ kind: "stopped", reason: "legal_name_missing" });
  });
});
