import { describe, expect, it } from "vitest";
import type { FiscalOnlineSignalEvidence } from "../../fiscal/index.js";
import { readSaleHistoryDetail } from "./read-sale-history-detail.js";
import { FakeReceiptLedger } from "./test-support/fake-receipt-ledger.js";
import {
  type FakeHistorySale,
  FakeRegisterSalesHistory,
} from "./test-support/fake-register-sales-history.js";
import { FixedClock } from "./test-support/fake-sale-ledger.js";
import { completedSale, FIRST_PRINT_AT, SENT_AT, voidedSale } from "./test-support/receipt-rig.js";

const NOW = new Date("2026-10-07T15:30:00.000Z");
const clock = new FixedClock(NOW);
const ONLINE: FiscalOnlineSignalEvidence = {
  lastHealthCheckOkAt: new Date(NOW.getTime() - 1_000),
  tokenValid: true,
  arcaReachable: true,
};

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
      voided: false,
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
          documentType: "factura_c",
          pointOfSale: 3,
          number: 1204,
        },
      },
      voided: false,
      inOpenSession: true,
      creditNote: null,
      ...overrides,
    },
  };
}

describe("readSaleHistoryDetail", () => {
  it("shows the sale's time, total, comprobante, operation number, who served it, lines and payments", () => {
    const history = new FakeRegisterSalesHistory([historySale()], ONLINE);
    const ledger = new FakeReceiptLedger({ sales: [completedSale()] });

    expect(readSaleHistoryDetail({ history, ledger, clock }, { saleId: "sale-1" })).toEqual({
      kind: "found",
      detail: {
        saleId: "sale-1",
        occurredAt: new Date("2026-10-07T15:00:00.000Z"),
        total: 7500,
        comprobante: { kind: "fiscal", documentType: "factura_c", pointOfSale: 3, number: 1204 },
        operationNumber: 482,
        servedByFirstName: "Marta",
        lineCount: 3,
        payments: [
          { method: "CASH", amount: 5000 },
          { method: "TRANSFER", amount: 2500 },
        ],
        standing: "completed",
        voidability: {
          kind: "voidable",
          refunds: [
            { method: "CASH", amount: 5000, state: "APPROVED", sentByCloud: false },
            { method: "TRANSFER", amount: 2500, state: "PENDING", sentByCloud: false },
          ],
        },
        creditNote: null,
        reprint: { kind: "available" },
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
          printedAt: SENT_AT,
          reprints: [
            {
              saleId: "sale-1",
              orderNumber: 1,
              requestedBy: "cashier",
              authorizedBy: null,
              reason: { kind: "retry" },
              occurredAt: SENT_AT,
            },
          ],
        }),
      ],
    });

    const outcome = readSaleHistoryDetail({ history, ledger, clock }, { saleId: "sale-1" });

    expect(outcome.kind === "found" && outcome.detail.nextCopy).toEqual({
      kind: "duplicate",
      orderNumber: 2,
    });
  });

  it("answers not_found for a sale the register's history does not hold", () => {
    const history = new FakeRegisterSalesHistory([]);
    const ledger = new FakeReceiptLedger({ sales: [completedSale()] });

    expect(readSaleHistoryDetail({ history, ledger, clock }, { saleId: "sale-1" })).toEqual({
      kind: "not_found",
    });
  });

  it("answers not_found for a sale whose receipt delivery is unknown", () => {
    const history = new FakeRegisterSalesHistory([historySale()]);
    const ledger = new FakeReceiptLedger({ sales: [completedSale({ completed: false })] });

    expect(readSaleHistoryDetail({ history, ledger, clock }, { saleId: "sale-1" })).toEqual({
      kind: "not_found",
    });
  });

  it("says reprinting is available for a sale that stands", () => {
    const history = new FakeRegisterSalesHistory([historySale()]);
    const ledger = new FakeReceiptLedger({ sales: [completedSale()] });
    const outcome = readSaleHistoryDetail({ history, ledger, clock }, { saleId: "sale-1" });

    expect(outcome.kind === "found" && outcome.detail.reprint).toEqual({ kind: "available" });
  });

  it("says a voided sale's receipt is not printed", () => {
    const history = new FakeRegisterSalesHistory([historySale({ voided: true })]);
    const ledger = new FakeReceiptLedger({ sales: [voidedSale()] });
    const outcome = readSaleHistoryDetail({ history, ledger, clock }, { saleId: "sale-1" });

    expect(outcome.kind === "found" && outcome.detail.reprint).toEqual({ kind: "sale_voided" });
  });

  describe("whether the sale may be voided", () => {
    const CASH_ONLY = [{ method: "CASH" as const, amount: 7500 }];
    const NO_INVOICE = { deferred: true, fiscalDocument: null };

    function voidability(overrides: Parameters<typeof historySale>[0]) {
      const history = new FakeRegisterSalesHistory([historySale(overrides)]);
      const ledger = new FakeReceiptLedger({ sales: [completedSale()] });
      const outcome = readSaleHistoryDetail({ history, ledger, clock }, { saleId: "sale-1" });
      return outcome.kind === "found" ? outcome.detail.voidability : undefined;
    }

    it("shows the refund each payment would get, cash on the spot and the rest pending", () => {
      expect(
        voidability({
          fiscal: NO_INVOICE,
          payments: [
            { method: "CASH", amount: 5000 },
            { method: "TRANSFER", amount: 1500 },
            { method: "STANDALONE_TERMINAL", amount: 1000 },
          ],
        }),
      ).toEqual({
        kind: "voidable",
        refunds: [
          { method: "CASH", amount: 5000, state: "APPROVED", sentByCloud: false },
          { method: "TRANSFER", amount: 1500, state: "PENDING", sentByCloud: false },
          { method: "STANDALONE_TERMINAL", amount: 1000, state: "PENDING", sentByCloud: false },
        ],
      });
    });

    it("is voidable with no refunds planned when nothing was paid", () => {
      expect(voidability({ fiscal: NO_INVOICE, payments: [] })).toEqual({
        kind: "voidable",
        refunds: [],
      });
    });

    it("says why a sale of a closed session cannot be voided", () => {
      expect(
        voidability({ fiscal: NO_INVOICE, payments: CASH_ONLY, inOpenSession: false }),
      ).toEqual({ kind: "not_voidable", refusal: "session_closed" });
    });

    it("says why a sale whose invoice is being requested cannot be voided", () => {
      const fiscal = {
        deferred: false,
        fiscalDocument: {
          state: "REQUESTING" as const,
          documentType: "factura_c" as const,
          pointOfSale: 3,
          number: 1204,
        },
      };

      expect(voidability({ fiscal, payments: CASH_ONLY })).toEqual({
        kind: "not_voidable",
        refusal: "invoice_in_flight",
      });
    });

    it("shows a sale paid through Mercado Pago as voidable, its refund pending", () => {
      expect(
        voidability({
          fiscal: NO_INVOICE,
          payments: [
            { method: "QR", amount: 7500 },
            { method: "POINT", amount: 1200 },
          ],
        }),
      ).toEqual({
        kind: "voidable",
        refunds: [
          { method: "QR", amount: 7500, state: "PENDING", sentByCloud: true },
          { method: "POINT", amount: 1200, state: "PENDING", sentByCloud: true },
        ],
      });
    });

    it("shows a sale that carries an authorized invoice as voidable while the tax authority can be reached", () => {
      const history = new FakeRegisterSalesHistory([historySale()], ONLINE);
      const ledger = new FakeReceiptLedger({ sales: [completedSale()] });

      const outcome = readSaleHistoryDetail({ history, ledger, clock }, { saleId: "sale-1" });

      expect(outcome).toMatchObject({
        kind: "found",
        detail: { voidability: { kind: "voidable" } },
      });
    });

    it("says a sale that carries an authorized invoice can be voided once the connection is back", () => {
      const history = new FakeRegisterSalesHistory([historySale()], {
        ...ONLINE,
        lastHealthCheckOkAt: new Date(NOW.getTime() - 15_001),
      });
      const ledger = new FakeReceiptLedger({ sales: [completedSale()] });

      const outcome = readSaleHistoryDetail({ history, ledger, clock }, { saleId: "sale-1" });

      expect(outcome).toMatchObject({
        kind: "found",
        detail: { voidability: { kind: "not_voidable", refusal: "invoice_needs_connection" } },
      });
    });

    it("says a voided sale is not a completed one", () => {
      expect(voidability({ fiscal: NO_INVOICE, payments: CASH_ONLY, voided: true })).toEqual({
        kind: "not_voidable",
        refusal: "not_completed",
      });
    });

    it.each([
      [
        {
          kind: "authorized",
          pointOfSale: 3,
          number: 41,
          issuedOn: "2026-10-07",
          authorizationCode: "75123456789099",
          authorizationCodeDueOn: "2026-10-17",
        },
      ],
      [{ kind: "in_progress" }],
      [{ kind: "rejected" }],
      [{ kind: "already_credited" }],
    ] as const)("shows the credit note of a voided sale, %o", (creditNote) => {
      const history = new FakeRegisterSalesHistory([
        historySale({ voided: true, creditNote: structuredClone(creditNote) }),
      ]);
      const ledger = new FakeReceiptLedger({ sales: [voidedSale()] });

      const outcome = readSaleHistoryDetail({ history, ledger, clock }, { saleId: "sale-1" });

      expect(outcome).toMatchObject({ kind: "found", detail: { creditNote } });
    });

    it("shows a voided sale with the voided standing", () => {
      const history = new FakeRegisterSalesHistory([
        historySale({ fiscal: NO_INVOICE, voided: true }),
      ]);
      const ledger = new FakeReceiptLedger({ sales: [completedSale()] });

      const outcome = readSaleHistoryDetail({ history, ledger, clock }, { saleId: "sale-1" });

      expect(outcome).toMatchObject({ kind: "found", detail: { standing: "voided" } });
    });
  });
});
