import { describe, expect, it } from "vitest";
import { declineSaleReceipt } from "./decline-sale-receipt.js";
import {
  authorizedSale,
  OFFLINE_AUTHORIZED,
  saleWithFiscal,
} from "./test-support/receipt-question-sales.js";
import { type completedSale, FIRST_PRINT_AT, receiptRig } from "./test-support/receipt-rig.js";

function declineRig(sales: ReturnType<typeof completedSale>[] = [authorizedSale()]) {
  const rig = receiptRig(sales);
  return { ...rig, decline: () => declineSaleReceipt(rig.ports, { saleId: "sale-1" }) };
}

describe("declineSaleReceipt", () => {
  it("records when the cashier declined the customer's factura C, in one transaction", () => {
    const rig = declineRig();

    expect(rig.decline()).toEqual({ kind: "declined" });
    expect(rig.ledger.state.sales[0]).toMatchObject({
      printDeclinedAt: FIRST_PRINT_AT,
      printAttemptedAt: null,
      printedAt: null,
    });
    expect(rig.ledger.transactions).toBe(1);
  });

  it("records the decline of a factura C authorized in contingency", () => {
    const rig = declineRig([
      saleWithFiscal({ kind: "offline_authorized", authorized: OFFLINE_AUTHORIZED }),
    ]);

    expect(rig.decline()).toEqual({ kind: "declined" });
    expect(rig.ledger.state.sales[0]?.printDeclinedAt).toEqual(FIRST_PRINT_AT);
  });

  it("answers declined again without moving the recorded time when it was already declined", () => {
    const rig = declineRig();
    rig.decline();
    rig.clock.set(new Date("2026-10-07T15:09:00.000Z"));

    expect(rig.decline()).toEqual({ kind: "declined" });
    expect(rig.ledger.state.sales[0]?.printDeclinedAt).toEqual(FIRST_PRINT_AT);
  });

  it("refuses a sale whose print was already attempted, as no longer awaiting the answer, and records nothing", () => {
    const rig = declineRig([
      authorizedSale({ printAttemptedAt: new Date("2026-10-07T15:00:30.000Z") }),
    ]);

    expect(rig.decline()).toEqual({ kind: "not_awaiting" });
    expect(rig.ledger.state.sales[0]?.printDeclinedAt ?? null).toBeNull();
  });

  it("refuses the deferred sale's non-fiscal document, which always prints", () => {
    const rig = declineRig([
      saleWithFiscal({ kind: "deferred", deferred: { id: "0198-abc", shortCode: "7KQ4M2P9" } }),
    ]);

    expect(rig.decline()).toEqual({ kind: "not_awaiting" });
    expect(rig.ledger.state.sales[0]?.printDeclinedAt ?? null).toBeNull();
  });

  it("refuses a sale with no fiscal document to ask about", () => {
    const rig = declineRig([saleWithFiscal({ kind: "none" })]);

    expect(rig.decline()).toEqual({ kind: "not_awaiting" });
  });

  it("answers not found for a sale that is not completed", () => {
    const rig = declineRig([saleWithFiscal({ kind: "none" }, { completed: false })]);

    expect(rig.decline()).toEqual({ kind: "not_found" });
  });

  it("answers not found for an unknown sale", () => {
    const rig = declineRig([]);

    expect(rig.decline()).toEqual({ kind: "not_found" });
  });
});
