import { describe, expect, it } from "vitest";
import type { SaleFiscalFacts } from "../model/sale-history.js";
import { readSaleComprobante } from "./read-sale-comprobante.js";
import { FakeRegisterSalesHistory } from "./test-support/fake-register-sales-history.js";

const CONTINGENCY_INVOICE: SaleFiscalFacts = {
  deferred: false,
  fiscalDocument: {
    state: "AUTHORIZED",
    documentType: "factura_c",
    authorization: "offline_code",
    pointOfSale: 31,
    number: 8,
  },
};

function historyOf(fiscal: SaleFiscalFacts) {
  return new FakeRegisterSalesHistory([
    {
      inOpenSession: true,
      entry: {
        saleId: "sale-1",
        occurredAt: new Date("2026-10-07T15:00:00.000Z"),
        operationNumber: 482,
        paymentMethods: ["CASH"],
        total: 7500,
        fiscal,
        voided: false,
      },
    },
  ]);
}

describe("readSaleComprobante", () => {
  it("answers the comprobante of the sale's fiscal facts", () => {
    expect(
      readSaleComprobante({ history: historyOf(CONTINGENCY_INVOICE) }, { saleId: "sale-1" }),
    ).toEqual({
      kind: "fiscal",
      documentType: "factura_c",
      authorization: "offline_code",
      pointOfSale: 31,
      number: 8,
    });
  });

  it("answers the comprobante of the sale asked for", () => {
    expect(
      readSaleComprobante({ history: historyOf(CONTINGENCY_INVOICE) }, { saleId: "sale-2" }),
    ).toEqual({ kind: "none" });
  });
});
