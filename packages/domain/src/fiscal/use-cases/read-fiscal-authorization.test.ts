import { describe, expect, it } from "vitest";
import { readFiscalAuthorization } from "./read-fiscal-authorization.js";
import { FakeFiscalGateLedger } from "./test-support/fake-fiscal-gate-ledger.js";

const AT = new Date("2026-10-01T12:00:00.000Z");
const PASSED = {
  saleId: "sale-1",
  evaluatedAt: AT,
  outcome: {
    kind: "passed" as const,
    document: {
      invoiceClass: "C" as const,
      total: 100,
      netAmount: 100,
      vatAmount: 0 as const,
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
  },
};
const FAILED = {
  saleId: "sale-2",
  evaluatedAt: AT,
  outcome: { kind: "failed" as const, reason: "legal_name_missing" as const },
};

describe("readFiscalAuthorization", () => {
  it("is authorized before any sale was evaluated", () => {
    expect(readFiscalAuthorization({ reader: new FakeFiscalGateLedger() })).toStrictEqual({
      kind: "authorized",
    });
  });

  it("is stopped, with the reason, while the latest evaluation failed", () => {
    const reader = new FakeFiscalGateLedger({ recorded: [PASSED, FAILED] });

    expect(readFiscalAuthorization({ reader })).toStrictEqual({
      kind: "stopped",
      reason: "legal_name_missing",
    });
  });

  it("is authorized again once a later evaluation passed", () => {
    const reader = new FakeFiscalGateLedger({
      recorded: [FAILED, { ...PASSED, saleId: "sale-3" }],
    });

    expect(readFiscalAuthorization({ reader })).toStrictEqual({ kind: "authorized" });
  });
});
