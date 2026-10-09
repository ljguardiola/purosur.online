import { describe, expect, it } from "vitest";
import { readSaleHistoryDetail } from "./read-sale-history-detail.js";
import { FakeReceiptLedger } from "./test-support/fake-receipt-ledger.js";
import {
  type FakeHistorySale,
  FakeRegisterSalesHistory,
} from "./test-support/fake-register-sales-history.js";
import { ACKNOWLEDGED_AT, completedSale, FIRST_PRINT_AT } from "./test-support/receipt-rig.js";

function historySale(
  overrides: Partial<NonNullable<FakeHistorySale["record"]>> = {},
): FakeHistorySale {
  return {
    inOpenSession: true,
    entry: {
      saleId: "sale-1",
      occurredAt: new Date("2026-10-07T15:00:00.000Z"),
      operationNumber: 482,
      paymentMethods: ["CASH"],
      total: 7500,
      fiscal: { deferred: false, fiscalDocument: null },
    },
    record: {
      saleId: "sale-1",
      occurredAt: new Date("2026-10-07T15:00:00.000Z"),
      operationNumber: 482,
      servedByFirstName: "Marta",
      lineCount: 3,
      total: 7500,
      payments: [
        { method: "CASH", amount: 5000 },
        { method: "TRANSFER", amount: 2500 },
      ],
      fiscal: {
        deferred: false,
        fiscalDocument: {
          state: "AUTHORIZED",
          documentType: "FACTURA_C",
          pointOfSale: 3,
          number: 1204,
        },
      },
      ...overrides,
    },
  };
}

describe("readSaleHistoryDetail", () => {
  it("shows the sale's time, total, comprobante, operation number, who served it, lines and payments", () => {
    const history = new FakeRegisterSalesHistory([historySale()]);
    const ledger = new FakeReceiptLedger({ sales: [completedSale()] });

    expect(readSaleHistoryDetail({ history, ledger }, { saleId: "sale-1" })).toEqual({
      kind: "found",
      detail: {
        saleId: "sale-1",
        occurredAt: new Date("2026-10-07T15:00:00.000Z"),
        total: 7500,
        comprobante: { kind: "fiscal", documentType: "FACTURA_C", pointOfSale: 3, number: 1204 },
        operationNumber: 482,
        servedByFirstName: "Marta",
        lineCount: 3,
        payments: [
          { method: "CASH", amount: 5000 },
          { method: "TRANSFER", amount: 2500 },
        ],
        standing: "completed",
        nextCopy: { kind: "original" },
      },
    });
  });

  it("shows the numbered duplicate the next printing would be once the receipt printed", () => {
    const history = new FakeRegisterSalesHistory([historySale()]);
    const ledger = new FakeReceiptLedger({
      sales: [
        completedSale({
          printAttemptedAt: FIRST_PRINT_AT,
          printedAt: ACKNOWLEDGED_AT,
          reprints: [
            {
              saleId: "sale-1",
              orderNumber: 1,
              requestedBy: "cashier",
              authorizedBy: null,
              reason: { kind: "retry" },
              occurredAt: ACKNOWLEDGED_AT,
            },
          ],
        }),
      ],
    });

    const outcome = readSaleHistoryDetail({ history, ledger }, { saleId: "sale-1" });

    expect(outcome.kind === "found" && outcome.detail.nextCopy).toEqual({
      kind: "duplicate",
      orderNumber: 2,
    });
  });

  it("answers not_found for a sale the register's history does not hold", () => {
    const history = new FakeRegisterSalesHistory([]);
    const ledger = new FakeReceiptLedger({ sales: [completedSale()] });

    expect(readSaleHistoryDetail({ history, ledger }, { saleId: "sale-1" })).toEqual({
      kind: "not_found",
    });
  });

  it("answers not_found for a sale whose receipt delivery is unknown", () => {
    const history = new FakeRegisterSalesHistory([historySale()]);
    const ledger = new FakeReceiptLedger({ sales: [completedSale({ completed: false })] });

    expect(readSaleHistoryDetail({ history, ledger }, { saleId: "sale-1" })).toEqual({
      kind: "not_found",
    });
  });
});
