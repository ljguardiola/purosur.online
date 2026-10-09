import { describe, expect, it } from "vitest";
import { createReceiptPrinting } from "./receipt-printing-wiring";

describe("the register's receipt printing without a local database", () => {
  const printing = createReceiptPrinting({
    database: undefined,
    gate: undefined,
    now: () => new Date(),
    ids: { next: () => "id" },
    readOutboxChainKey: async () => undefined,
    signedInUserId: () => undefined,
    reportFailure: () => {},
    syncNow: () => {},
  });

  it("offers no request to answer", () => {
    expect(printing.receiptPrintStatus).toBeUndefined();
    expect(printing.retryReceiptPrint).toBeUndefined();
    expect(printing.reprintSaleReceipt).toBeUndefined();
  });

  it("leaves a charge as it is", () => {
    const charge = async () => ({ kind: "completed", sale_id: "sale-1" });

    expect(printing.afterCompletedSale(charge)).toBe(charge);
  });
});
