import { describe, expect, it } from "vitest";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../../fiscal/test-support/fictional-tax-identities.js";
import { receiptDeliveryOf } from "./receipt-delivery-of.js";
import type { FakeCreditNote, FakeReceiptSale } from "./test-support/fake-receipt-ledger.js";
import {
  completedSale,
  creditNoteContent,
  FIRST_PRINT_AT,
  receiptRig,
  creditedSale as rigCreditedSale,
  SENT_AT,
} from "./test-support/receipt-rig.js";

const CREDIT_NOTE_CONTENT = creditNoteContent({
  legalName: FICTIONAL_LEGAL_NAME,
  cuit: FICTIONAL_CUIT,
  taxStatus: "Responsable Monotributo",
  grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
  activityStartDate: "2020-01-15",
});

function creditedSale(
  overrides: Partial<FakeCreditNote> = {},
  sale: Partial<FakeReceiptSale> = {},
) {
  return rigCreditedSale({ content: CREDIT_NOTE_CONTENT, ...overrides }, sale);
}

describe("receiptDeliveryOf", () => {
  it("answers that a sale never printed would print the original next", () => {
    const rig = receiptRig();

    expect(receiptDeliveryOf(rig.ports, { document: "sale_receipt", saleId: "sale-1" })).toEqual({
      kind: "found",
      nextCopy: { kind: "original" },
      printAttemptedAt: null,
      printedAt: null,
    });
  });

  it("answers the numbered duplicate a printed sale would print next, with when it printed", () => {
    const rig = receiptRig([
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
    ]);

    expect(receiptDeliveryOf(rig.ports, { document: "sale_receipt", saleId: "sale-1" })).toEqual({
      kind: "found",
      nextCopy: { kind: "duplicate", orderNumber: 2 },
      printAttemptedAt: FIRST_PRINT_AT,
      printedAt: SENT_AT,
    });
  });

  it("answers not_found for a sale that is not completed", () => {
    const rig = receiptRig([completedSale({ completed: false })]);

    expect(receiptDeliveryOf(rig.ports, { document: "sale_receipt", saleId: "sale-1" })).toEqual({
      kind: "not_found",
    });
  });

  it("answers the credit note's copy from the credit note's own printing, not the sale receipt's", () => {
    const rig = receiptRig([
      creditedSale({ printAttemptedAt: FIRST_PRINT_AT }, { printAttemptedAt: null }),
    ]);

    expect(receiptDeliveryOf(rig.ports, { document: "credit_note", saleId: "sale-1" })).toEqual({
      kind: "found",
      nextCopy: { kind: "duplicate", orderNumber: 1 },
      printAttemptedAt: FIRST_PRINT_AT,
      printedAt: null,
    });
    expect(
      receiptDeliveryOf(rig.ports, { document: "sale_receipt", saleId: "sale-1" }),
    ).toMatchObject({
      nextCopy: { kind: "original" },
    });
  });
});
