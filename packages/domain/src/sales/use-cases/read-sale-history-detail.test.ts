import { FICTIONAL_ISSUER } from "@purosur/domain/fiscal/test-support";
import { describe, expect, it } from "vitest";
import { readSaleHistoryDetail } from "./read-sale-history-detail.js";
import type { SaleHistoryCreditNote } from "./register-sales-history.js";
import { FakeReceiptLedger } from "./test-support/fake-receipt-ledger.js";
import {
  type FakeHistorySale,
  FakeRegisterSalesHistory,
} from "./test-support/fake-register-sales-history.js";
import {
  completedSale,
  creditedSales,
  FIRST_PRINT_AT,
  returnCreditNote,
  SENT_AT,
  voidedSale,
} from "./test-support/receipt-rig.js";

const creditedSale = creditedSales(FICTIONAL_ISSUER);

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
        { method: "CASH", amount: 5000, cardType: null },
        { method: "TRANSFER", amount: 2500, cardType: null },
      ],
      fiscal: {
        deferred: false,
        fiscalDocument: {
          state: "AUTHORIZED",
          documentType: "factura_c",
          authorization: "real_time",
          pointOfSale: 3,
          number: 1204,
        },
      },
      voided: false,
      inOpenSession: true,
      hasReturn: false,
      invoices: [
        {
          origin: "real_time",
          state: "AUTHORIZED",
          pointOfSale: 3,
          number: 1204,
          buyerTaxStatusCode: 5,
        },
      ],
      creditNotes: [],
      deferredInvoiceIssued: false,
      deferredShortCode: null,
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
        comprobante: {
          kind: "fiscal",
          documentType: "factura_c",
          authorization: "real_time",
          pointOfSale: 3,
          number: 1204,
        },
        operationNumber: 482,
        servedByFirstName: "Marta",
        lineCount: 3,
        payments: [
          { method: "CASH", amount: 5000, cardType: null },
          { method: "TRANSFER", amount: 2500, cardType: null },
        ],
        standing: "completed",
        voidability: {
          kind: "voidable",
          refunds: [
            { method: "CASH", cardType: null, amount: 5000, state: "APPROVED", sentByCloud: false },
            {
              method: "TRANSFER",
              cardType: null,
              amount: 2500,
              state: "PENDING",
              sentByCloud: false,
            },
          ],
          creditNoteCorrects: { voucherType: 11, pointOfSale: 3, number: 1204 },
        },
        creditNotes: [],
        reprint: { kind: "available" },
        nextCopy: { kind: "original" },
        deferredInvoiceNextCopy: null,
        shortCode: null,
      },
    });
  });

  it("carries the short code recorded for the sale's deferred invoicing", () => {
    const history = new FakeRegisterSalesHistory([historySale({ deferredShortCode: "7KQ4M2P9" })]);
    const ledger = new FakeReceiptLedger({ sales: [completedSale()] });

    const outcome = readSaleHistoryDetail({ history, ledger }, { saleId: "sale-1" });

    expect(outcome.kind === "found" && outcome.detail.shortCode).toBe("7KQ4M2P9");
    expect(outcome.kind === "found" && "deferredShortCode" in outcome.detail).toBe(false);
  });

  it("shows no short code for a sale without a deferred record", () => {
    const history = new FakeRegisterSalesHistory([historySale()]);
    const ledger = new FakeReceiptLedger({ sales: [completedSale()] });

    const outcome = readSaleHistoryDetail({ history, ledger }, { saleId: "sale-1" });

    expect(outcome.kind === "found" && outcome.detail.shortCode).toBeNull();
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
              document: "sale_receipt",
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

  it("says reprinting is available for a sale that stands", () => {
    const history = new FakeRegisterSalesHistory([historySale()]);
    const ledger = new FakeReceiptLedger({ sales: [completedSale()] });
    const outcome = readSaleHistoryDetail({ history, ledger }, { saleId: "sale-1" });

    expect(outcome.kind === "found" && outcome.detail.reprint).toEqual({ kind: "available" });
  });

  it("says a voided sale's receipt is not printed", () => {
    const history = new FakeRegisterSalesHistory([historySale({ voided: true })]);
    const ledger = new FakeReceiptLedger({ sales: [voidedSale()] });
    const outcome = readSaleHistoryDetail({ history, ledger }, { saleId: "sale-1" });

    expect(outcome.kind === "found" && outcome.detail.reprint).toEqual({ kind: "sale_voided" });
  });

  describe("whether the sale may be voided", () => {
    const CASH_ONLY = [{ method: "CASH" as const, amount: 7500, cardType: null }];
    const NO_INVOICE = { deferred: true, fiscalDocument: null };
    const NOT_INVOICED = { fiscal: NO_INVOICE, invoices: [] };

    function voidability(overrides: Parameters<typeof historySale>[0]) {
      const history = new FakeRegisterSalesHistory([historySale(overrides)]);
      const ledger = new FakeReceiptLedger({ sales: [completedSale()] });
      const outcome = readSaleHistoryDetail({ history, ledger }, { saleId: "sale-1" });
      return outcome.kind === "found" ? outcome.detail.voidability : undefined;
    }

    it("shows the refund each payment would get, cash on the spot and the rest pending", () => {
      expect(
        voidability({
          ...NOT_INVOICED,
          payments: [
            { method: "CASH", amount: 5000, cardType: null },
            { method: "TRANSFER", amount: 1500, cardType: null },
            { method: "STANDALONE_TERMINAL", amount: 1000, cardType: null },
          ],
        }),
      ).toEqual({
        kind: "voidable",
        refunds: [
          { method: "CASH", cardType: null, amount: 5000, state: "APPROVED", sentByCloud: false },
          {
            method: "TRANSFER",
            cardType: null,
            amount: 1500,
            state: "PENDING",
            sentByCloud: false,
          },
          {
            method: "STANDALONE_TERMINAL",
            cardType: null,
            amount: 1000,
            state: "PENDING",
            sentByCloud: false,
          },
        ],
        creditNoteCorrects: null,
      });
    });

    it("is voidable with no refunds planned when nothing was paid", () => {
      expect(voidability({ ...NOT_INVOICED, payments: [] })).toEqual({
        kind: "voidable",
        refunds: [],
        creditNoteCorrects: null,
      });
    });

    it("says why a sale of a closed session cannot be voided", () => {
      expect(voidability({ ...NOT_INVOICED, payments: CASH_ONLY, inOpenSession: false })).toEqual({
        kind: "not_voidable",
        refusal: "session_closed",
      });
    });

    it("says a sale that already has a return cannot be voided, even one of the open session", () => {
      expect(voidability({ ...NOT_INVOICED, payments: CASH_ONLY, hasReturn: true })).toEqual({
        kind: "not_voidable",
        refusal: "has_return",
      });
    });

    it("says why a sale whose invoice is being requested cannot be voided", () => {
      const fiscal = {
        deferred: false,
        fiscalDocument: {
          state: "REQUESTING" as const,
          documentType: "factura_c" as const,
          authorization: "real_time" as const,
          pointOfSale: 3,
          number: 1204,
        },
      };

      expect(
        voidability({
          fiscal,
          invoices: [
            {
              origin: "real_time",
              state: "REQUESTING",
              pointOfSale: 3,
              number: 1204,
              buyerTaxStatusCode: 5,
            },
          ],
          payments: CASH_ONLY,
        }),
      ).toEqual({
        kind: "not_voidable",
        refusal: "invoice_in_flight",
      });
    });

    it("shows a sale paid through Mercado Pago as voidable, its refund pending", () => {
      expect(
        voidability({
          ...NOT_INVOICED,
          payments: [
            { method: "QR", amount: 7500, cardType: null },
            { method: "POINT", amount: 1200, cardType: "CREDIT" },
          ],
        }),
      ).toEqual({
        kind: "voidable",
        refunds: [
          { method: "QR", cardType: null, amount: 7500, state: "PENDING", sentByCloud: true },
          {
            method: "POINT",
            cardType: "CREDIT",
            amount: 1200,
            state: "PENDING",
            sentByCloud: true,
          },
        ],
        creditNoteCorrects: null,
      });
    });

    it("shows a sale that carries an authorized invoice as voidable", () => {
      const history = new FakeRegisterSalesHistory([historySale()]);
      const ledger = new FakeReceiptLedger({ sales: [completedSale()] });

      const outcome = readSaleHistoryDetail({ history, ledger }, { saleId: "sale-1" });

      expect(outcome).toMatchObject({
        kind: "found",
        detail: { voidability: { kind: "voidable" } },
      });
    });

    it("weighs every fiscal document of the sale: one whose real-time invoice was released and whose contingency document stands can be voided, correcting the contingency document", () => {
      expect(
        voidability({
          fiscal: {
            deferred: false,
            fiscalDocument: {
              state: "RELEASED",
              documentType: "factura_c",
              authorization: "real_time",
              pointOfSale: 3,
              number: 1204,
            },
          },
          invoices: [
            {
              origin: "real_time",
              state: "RELEASED",
              pointOfSale: 3,
              number: 1204,
              buyerTaxStatusCode: 5,
            },
            {
              origin: "offline",
              state: "AUTHORIZED",
              pointOfSale: 8,
              number: 77,
              buyerTaxStatusCode: 5,
            },
          ],
          payments: CASH_ONLY,
        }),
      ).toMatchObject({
        kind: "voidable",
        creditNoteCorrects: { voucherType: 11, pointOfSale: 8, number: 77 },
      });
    });

    it("names the invoice the void's credit note would correct, the one the customer received", () => {
      const history = new FakeRegisterSalesHistory([
        historySale({
          payments: CASH_ONLY,
          invoices: [
            {
              origin: "real_time",
              state: "AUTHORIZED",
              pointOfSale: 3,
              number: 1204,
              buyerTaxStatusCode: 5,
            },
            {
              origin: "offline",
              state: "AUTHORIZED",
              pointOfSale: 8,
              number: 77,
              buyerTaxStatusCode: 5,
            },
          ],
        }),
      ]);
      const ledger = new FakeReceiptLedger({ sales: [completedSale()] });

      const outcome = readSaleHistoryDetail({ history, ledger }, { saleId: "sale-1" });

      expect(outcome).toMatchObject({
        kind: "found",
        detail: {
          voidability: {
            kind: "voidable",
            creditNoteCorrects: { voucherType: 11, pointOfSale: 8, number: 77 },
          },
        },
      });
    });

    it("says a voided sale is not a completed one", () => {
      expect(voidability({ ...NOT_INVOICED, payments: CASH_ONLY, voided: true })).toEqual({
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
          issuedAt: new Date("2026-10-07T15:20:00.000Z"),
          authorizationCode: "75123456789099",
          authorizationCodeDueOn: "2026-10-17",
        },
      ],
      [
        {
          kind: "issued_offline",
          pointOfSale: 9,
          number: 41,
          issuedOn: "2026-10-07",
          issuedAt: new Date("2026-10-07T15:20:00.000Z"),
          offlineAuthorizationCode: "71234567890123",
          fortnight: { start: "2026-10-01", end: "2026-10-15" },
        },
      ],
      [{ kind: "in_progress" }],
      [{ kind: "rejected" }],
      [{ kind: "already_credited" }],
    ] as const)("shows the credit note of a voided sale, %o", (standing) => {
      const history = new FakeRegisterSalesHistory([
        historySale({
          voided: true,
          creditNotes: [
            {
              creditNoteId: "credit-note-1",
              origin: "sale_void",
              standing: structuredClone(standing),
            },
          ],
        }),
      ]);
      const ledger = new FakeReceiptLedger({ sales: [voidedSale()] });

      const outcome = readSaleHistoryDetail({ history, ledger }, { saleId: "sale-1" });

      expect(outcome).toMatchObject({
        kind: "found",
        detail: {
          creditNotes: [{ creditNoteId: "credit-note-1", origin: "sale_void", standing }],
        },
      });
    });

    const AUTHORIZED_CREDIT_NOTE = {
      kind: "authorized",
      pointOfSale: 3,
      number: 41,
      issuedOn: "2026-10-07",
      issuedAt: new Date("2026-10-07T15:20:00.000Z"),
      authorizationCode: "75123456789099",
      authorizationCodeDueOn: "2026-10-17",
    } as const;

    const ISSUED_OFFLINE_CREDIT_NOTE = {
      kind: "issued_offline",
      pointOfSale: 9,
      number: 41,
      issuedOn: "2026-10-07",
      issuedAt: new Date("2026-10-07T15:20:00.000Z"),
      offlineAuthorizationCode: "71234567890123",
      fortnight: { start: "2026-10-01", end: "2026-10-15" },
    } as const;

    const voidNote = (standing: SaleHistoryCreditNote["standing"]): SaleHistoryCreditNote => ({
      creditNoteId: "credit-note-1",
      origin: "sale_void",
      standing,
    });

    const nextCopiesOf = (
      creditNotes: SaleHistoryCreditNote[],
      ledger: FakeReceiptLedger,
    ): unknown => {
      const history = new FakeRegisterSalesHistory([historySale({ voided: true, creditNotes })]);
      const outcome = readSaleHistoryDetail({ history, ledger }, { saleId: "sale-1" });
      return outcome.kind === "found"
        ? outcome.detail.creditNotes.map(({ nextCopy }) => nextCopy)
        : outcome;
    };

    it("shows the credit note's original as its next copy while it was never printed", () => {
      const ledger = new FakeReceiptLedger({ sales: [creditedSale()] });

      expect(nextCopiesOf([voidNote(AUTHORIZED_CREDIT_NOTE)], ledger)).toEqual([
        { kind: "original" },
      ]);
    });

    it("shows none for a sale without a credit note", () => {
      const history = new FakeRegisterSalesHistory([historySale()]);
      const ledger = new FakeReceiptLedger({ sales: [creditedSale()] });

      expect(readSaleHistoryDetail({ history, ledger }, { saleId: "sale-1" })).toMatchObject({
        detail: { creditNotes: [] },
      });
    });

    it("shows the original of a credit note issued offline as its next copy while it was never printed", () => {
      const ledger = new FakeReceiptLedger({ sales: [creditedSale()] });

      expect(nextCopiesOf([voidNote(ISSUED_OFFLINE_CREDIT_NOTE)], ledger)).toEqual([
        { kind: "original" },
      ]);
    });

    it("shows the numbered duplicate the credit note would print next, apart from the receipt's copies", () => {
      const history = new FakeRegisterSalesHistory([
        historySale({ voided: true, creditNotes: [voidNote(AUTHORIZED_CREDIT_NOTE)] }),
      ]);
      const ledger = new FakeReceiptLedger({
        sales: [
          creditedSale(
            {
              printAttemptedAt: FIRST_PRINT_AT,
              reprints: [
                {
                  document: "credit_note",
                  saleId: "sale-1",
                  creditNoteId: "credit-note-1",
                  orderNumber: 1,
                  requestedBy: "cashier",
                  authorizedBy: null,
                  reason: { kind: "retry" },
                  occurredAt: SENT_AT,
                },
              ],
            },
            { printAttemptedAt: FIRST_PRINT_AT },
          ),
        ],
      });

      const outcome = readSaleHistoryDetail({ history, ledger }, { saleId: "sale-1" });

      expect(outcome).toMatchObject({
        kind: "found",
        detail: {
          creditNotes: [{ nextCopy: { kind: "duplicate", orderNumber: 2 } }],
          nextCopy: { kind: "duplicate", orderNumber: 1 },
        },
      });
    });

    it.each([
      [{ kind: "in_progress" }],
      [{ kind: "rejected" }],
      [{ kind: "already_credited" }],
      [{ kind: "regularization_required" }],
    ] as const)("has no next copy of the credit note while its standing is %o", (standing) => {
      const ledger = new FakeReceiptLedger({ sales: [creditedSale()] });

      expect(nextCopiesOf([voidNote(structuredClone(standing))], ledger)).toEqual([null]);
    });

    describe("a sale with the credit notes of its returns", () => {
      const returnNote = (
        creditNoteId: string,
        standing: SaleHistoryCreditNote["standing"],
      ): SaleHistoryCreditNote => ({ creditNoteId, origin: "sale_return", standing });

      const returnReprint = (creditNoteId: string, orderNumber: number) => ({
        document: "credit_note" as const,
        saleId: "sale-1",
        creditNoteId,
        orderNumber,
        requestedBy: "cashier",
        authorizedBy: null,
        reason: { kind: "retry" as const },
        occurredAt: SENT_AT,
      });

      const ledgerOfTwoReturns = () => {
        const sale = creditedSale({
          id: "credit-note-1",
          printAttemptedAt: FIRST_PRINT_AT,
          reprints: [returnReprint("credit-note-1", 1)],
        });
        return new FakeReceiptLedger({
          sales: [
            {
              ...sale,
              returnCreditNotes: [
                returnCreditNote(FICTIONAL_ISSUER, { id: "credit-note-2" }),
                returnCreditNote(FICTIONAL_ISSUER, {
                  id: "credit-note-3",
                  printAttemptedAt: FIRST_PRINT_AT,
                  reprints: [returnReprint("credit-note-3", 1), returnReprint("credit-note-3", 2)],
                }),
              ],
            },
          ],
        });
      };

      it("lists every credit note in the order the register holds them, each with its origin and standing", () => {
        const history = new FakeRegisterSalesHistory([
          historySale({
            voided: true,
            creditNotes: [
              voidNote(AUTHORIZED_CREDIT_NOTE),
              returnNote("credit-note-2", { kind: "in_progress" }),
              returnNote("credit-note-3", ISSUED_OFFLINE_CREDIT_NOTE),
            ],
          }),
        ]);

        const outcome = readSaleHistoryDetail(
          { history, ledger: ledgerOfTwoReturns() },
          { saleId: "sale-1" },
        );

        expect(outcome).toMatchObject({
          kind: "found",
          detail: {
            creditNotes: [
              {
                creditNoteId: "credit-note-1",
                origin: "sale_void",
                standing: AUTHORIZED_CREDIT_NOTE,
              },
              {
                creditNoteId: "credit-note-2",
                origin: "sale_return",
                standing: { kind: "in_progress" },
              },
              {
                creditNoteId: "credit-note-3",
                origin: "sale_return",
                standing: ISSUED_OFFLINE_CREDIT_NOTE,
              },
            ],
          },
        });
      });

      it("counts the next copy of each credit note by its own reprints", () => {
        expect(
          nextCopiesOf(
            [
              voidNote(AUTHORIZED_CREDIT_NOTE),
              returnNote("credit-note-2", AUTHORIZED_CREDIT_NOTE),
              returnNote("credit-note-3", AUTHORIZED_CREDIT_NOTE),
            ],
            ledgerOfTwoReturns(),
          ),
        ).toEqual([
          { kind: "duplicate", orderNumber: 2 },
          { kind: "original" },
          { kind: "duplicate", orderNumber: 3 },
        ]);
      });

      it("gives no next copy only to the credit notes that are not authorized", () => {
        expect(
          nextCopiesOf(
            [
              voidNote(AUTHORIZED_CREDIT_NOTE),
              returnNote("credit-note-2", { kind: "rejected" }),
              returnNote("credit-note-3", ISSUED_OFFLINE_CREDIT_NOTE),
            ],
            ledgerOfTwoReturns(),
          ),
        ).toEqual([
          { kind: "duplicate", orderNumber: 2 },
          null,
          { kind: "duplicate", orderNumber: 3 },
        ]);
      });
    });

    it("shows a voided sale with the voided standing", () => {
      const history = new FakeRegisterSalesHistory([
        historySale({ ...NOT_INVOICED, voided: true }),
      ]);
      const ledger = new FakeReceiptLedger({ sales: [completedSale()] });

      const outcome = readSaleHistoryDetail({ history, ledger }, { saleId: "sale-1" });

      expect(outcome).toMatchObject({ kind: "found", detail: { standing: "voided" } });
    });
  });

  describe("the invoice of a sale that was deferred", () => {
    const REPRINT = {
      document: "deferred_invoice",
      saleId: "sale-1",
      orderNumber: 1,
      requestedBy: "cashier",
      authorizedBy: null,
      reason: { kind: "retry" },
      occurredAt: SENT_AT,
    } as const;

    it("has no next copy for a sale that was never deferred", () => {
      const history = new FakeRegisterSalesHistory([historySale()]);
      const ledger = new FakeReceiptLedger({ sales: [completedSale()] });

      const outcome = readSaleHistoryDetail({ history, ledger }, { saleId: "sale-1" });

      expect(outcome).toMatchObject({ kind: "found", detail: { deferredInvoiceNextCopy: null } });
    });

    it("shows its original as the next copy while it was never printed, whatever the sale's receipt did", () => {
      const history = new FakeRegisterSalesHistory([historySale({ deferredInvoiceIssued: true })]);
      const ledger = new FakeReceiptLedger({
        sales: [completedSale({ printAttemptedAt: FIRST_PRINT_AT, printedAt: SENT_AT })],
      });

      const outcome = readSaleHistoryDetail({ history, ledger }, { saleId: "sale-1" });

      expect(outcome).toMatchObject({
        kind: "found",
        detail: {
          deferredInvoiceNextCopy: { kind: "original" },
          nextCopy: { kind: "duplicate", orderNumber: 1 },
        },
      });
    });

    it("shows the numbered duplicate it would print next once its original was attempted, apart from the sale receipt's", () => {
      const history = new FakeRegisterSalesHistory([historySale({ deferredInvoiceIssued: true })]);
      const ledger = new FakeReceiptLedger({
        sales: [
          completedSale({
            deferredInvoice: {
              printAttemptedAt: FIRST_PRINT_AT,
              printedAt: SENT_AT,
              stored: undefined,
              reprints: [REPRINT],
            },
          }),
        ],
      });

      const outcome = readSaleHistoryDetail({ history, ledger }, { saleId: "sale-1" });

      expect(outcome).toMatchObject({
        kind: "found",
        detail: {
          deferredInvoiceNextCopy: { kind: "duplicate", orderNumber: 2 },
          nextCopy: { kind: "original" },
        },
      });
    });
  });
});
