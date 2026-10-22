import { FICTIONAL_ISSUER } from "@purosur/domain/fiscal/test-support";
import { describe, expect, it } from "vitest";
import { receiptDeliveryOf } from "./receipt-delivery-of.js";
import {
  completedSale,
  creditedSales,
  FIRST_PRINT_AT,
  receiptRig,
  SENT_AT,
} from "./test-support/receipt-rig.js";

const creditedSale = creditedSales(FICTIONAL_ISSUER);

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
