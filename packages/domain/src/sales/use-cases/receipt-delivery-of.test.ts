import { describe, expect, it } from "vitest";
import { receiptDeliveryOf } from "./receipt-delivery-of.js";
import { completedSale, FIRST_PRINT_AT, ACKNOWLEDGED_AT, receiptRig } from "./test-support/receipt-rig.js";

describe("receiptDeliveryOf", () => {
  it("answers that a sale never printed would print the original next", () => {
    const rig = receiptRig();

    expect(receiptDeliveryOf(rig.ports, { saleId: "sale-1" })).toEqual({
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
    ]);

    expect(receiptDeliveryOf(rig.ports, { saleId: "sale-1" })).toEqual({
      kind: "found",
      nextCopy: { kind: "duplicate", orderNumber: 2 },
      printAttemptedAt: FIRST_PRINT_AT,
      printedAt: ACKNOWLEDGED_AT,
    });
  });

  it("answers not_found for a sale that is not completed", () => {
    const rig = receiptRig([completedSale({ completed: false })]);

    expect(receiptDeliveryOf(rig.ports, { saleId: "sale-1" })).toEqual({ kind: "not_found" });
  });
});
