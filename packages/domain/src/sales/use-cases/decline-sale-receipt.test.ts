import { describe, expect, it } from "vitest";
import { authorizedFacturaC } from "../model/test-support/authorized-factura-c.js";
import {
  FICTIONAL_CUIT,
  FICTIONAL_GROSS_INCOME_REGISTRATION,
  FICTIONAL_LEGAL_NAME,
} from "../../fiscal/test-support/fictional-tax-identities.js";
import { declineSaleReceipt } from "./decline-sale-receipt.js";
import { completedSale, FIRST_PRINT_AT, receiptRig } from "./test-support/receipt-rig.js";

const ISSUER_IDENTITY = {
  legalName: FICTIONAL_LEGAL_NAME,
  cuit: FICTIONAL_CUIT,
  grossIncomeRegistration: FICTIONAL_GROSS_INCOME_REGISTRATION,
};
const AUTHORIZED = authorizedFacturaC(6750, ISSUER_IDENTITY);
const OFFLINE_AUTHORIZED = {
  pointOfSale: 7,
  number: 101,
  issuedOn: "2026-10-07",
  document: AUTHORIZED.document,
  offlineAuthorizationCode: "71234567890123",
  fortnight: { start: "2026-10-01", end: "2026-10-15" },
};

function saleWithFiscal(
  fiscal: ReturnType<typeof completedSale>["source"]["fiscal"],
  overrides: Parameters<typeof completedSale>[0] = {},
) {
  const sale = completedSale(overrides);
  return { ...sale, source: { ...sale.source, fiscal } };
}

const AUTHORIZED_SALE = saleWithFiscal({ kind: "authorized", authorized: AUTHORIZED });

function declineRig(sales = [AUTHORIZED_SALE]) {
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

  it("refuses a sale whose print was already attempted and records nothing", () => {
    const rig = declineRig([
      saleWithFiscal(
        { kind: "authorized", authorized: AUTHORIZED },
        { printAttemptedAt: new Date("2026-10-07T15:00:30.000Z") },
      ),
    ]);

    expect(rig.decline()).toEqual({ kind: "already_attempted" });
    expect(rig.ledger.state.sales[0]?.printDeclinedAt ?? null).toBeNull();
  });

  it("refuses the deferred sale's non-fiscal document, which always prints", () => {
    const rig = declineRig([
      saleWithFiscal({ kind: "deferred", deferred: { id: "0198-abc", shortCode: "7KQ4M2P9" } }),
    ]);

    expect(rig.decline()).toEqual({ kind: "not_asked" });
    expect(rig.ledger.state.sales[0]?.printDeclinedAt ?? null).toBeNull();
  });

  it("refuses a sale with no fiscal document to ask about", () => {
    const rig = declineRig([saleWithFiscal({ kind: "none" })]);

    expect(rig.decline()).toEqual({ kind: "not_asked" });
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
