import { FICTIONAL_ISSUER } from "@purosur/domain/fiscal/test-support";
import { describe, expect, it } from "vitest";
import { RECEIPT_PRINT_OFFER_MS, receiptPrintOfferDeadline } from "../model/receipt-print-offer.js";
import { lapseReceiptPrintOffer } from "./lapse-receipt-print-offer.js";
import { authorizedSale, saleWithFiscal } from "./test-support/receipt-question-sales.js";
import { type completedSale, FIRST_PRINT_AT, receiptRig } from "./test-support/receipt-rig.js";

const DEADLINE = receiptPrintOfferDeadline(FIRST_PRINT_AT);

function lapseRig(sales: ReturnType<typeof completedSale>[] = [authorizedSale(FICTIONAL_ISSUER)]) {
  const rig = receiptRig(sales);
  return {
    ...rig,
    lapse: () => lapseReceiptPrintOffer(rig.ports, { saleId: "sale-1", deadline: DEADLINE }),
    at: (milliseconds: number) => {
      rig.clock.set(new Date(FIRST_PRINT_AT.getTime() + milliseconds));
    },
  };
}

describe("lapseReceiptPrintOffer", () => {
  it("keeps the offer open before its deadline, answering what is left of it, without recording anything", () => {
    const rig = lapseRig();
    rig.at(1200);

    expect(rig.lapse()).toEqual({ kind: "open", remainingMs: RECEIPT_PRINT_OFFER_MS - 1200 });
    expect(rig.ledger.state.sales[0]?.printDeclinedAt ?? null).toBeNull();
    expect(rig.ledger.transactions).toBe(1);
  });

  it("leaves the ticket unprinted, recorded as declined at the moment it lapsed, once the deadline is reached", () => {
    const rig = lapseRig();
    rig.at(RECEIPT_PRINT_OFFER_MS);

    expect(rig.lapse()).toEqual({ kind: "lapsed" });
    expect(rig.ledger.state.sales[0]).toMatchObject({
      printDeclinedAt: DEADLINE,
      printAttemptedAt: null,
      printedAt: null,
    });
    expect(rig.printer.sent).toEqual([]);
  });

  it("lapses an offer whose deadline already passed", () => {
    const rig = lapseRig();
    rig.at(RECEIPT_PRINT_OFFER_MS + 4000);

    expect(rig.lapse()).toEqual({ kind: "lapsed" });
    expect(rig.ledger.state.sales[0]?.printDeclinedAt).toEqual(
      new Date(FIRST_PRINT_AT.getTime() + RECEIPT_PRINT_OFFER_MS + 4000),
    );
  });

  it("answers lapsed again without moving the recorded time when it already lapsed", () => {
    const rig = lapseRig();
    rig.at(RECEIPT_PRINT_OFFER_MS);
    rig.lapse();
    rig.at(RECEIPT_PRINT_OFFER_MS + 9000);

    expect(rig.lapse()).toEqual({ kind: "lapsed" });
    expect(rig.ledger.state.sales[0]?.printDeclinedAt).toEqual(DEADLINE);
  });

  it("answers not awaiting for a receipt that always prints, recording nothing", () => {
    const rig = lapseRig([saleWithFiscal({ kind: "none" })]);
    rig.at(RECEIPT_PRINT_OFFER_MS);

    expect(rig.lapse()).toEqual({ kind: "not_awaiting" });
    expect(rig.ledger.state.sales[0]?.printDeclinedAt ?? null).toBeNull();
  });

  it("answers not awaiting for a ticket the cashier already chose to print", () => {
    const rig = lapseRig([authorizedSale(FICTIONAL_ISSUER, { printAttemptedAt: FIRST_PRINT_AT })]);
    rig.at(RECEIPT_PRINT_OFFER_MS);

    expect(rig.lapse()).toEqual({ kind: "not_awaiting" });
    expect(rig.ledger.state.sales[0]?.printDeclinedAt ?? null).toBeNull();
  });

  it("answers not found for an unknown sale", () => {
    const rig = lapseRig([]);

    expect(rig.lapse()).toEqual({ kind: "not_found" });
  });
});
