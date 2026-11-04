import { FICTIONAL_ISSUER } from "@purosur/domain/fiscal/test-support";
import { describe, expect, it } from "vitest";
import { receiptQuestionOf } from "./receipt-question-of.js";
import {
  authorizedSale,
  offlineAuthorized,
  saleWithFiscal,
} from "./test-support/receipt-question-sales.js";
import { completedSale, FIRST_PRINT_AT, receiptRig, SENT_AT } from "./test-support/receipt-rig.js";

function questionOf(sales: ReturnType<typeof completedSale>[]) {
  const rig = receiptRig(sales);
  return { rig, outcome: receiptQuestionOf(rig.ports, { saleId: "sale-1" }) };
}

describe("receiptQuestionOf", () => {
  it("asks before printing the customer's factura C never sent to the printer, in one transaction", () => {
    const { rig, outcome } = questionOf([authorizedSale(FICTIONAL_ISSUER)]);

    expect(outcome).toEqual({ kind: "asks" });
    expect(rig.ledger.transactions).toBe(1);
  });

  it("asks before printing a factura C authorized in contingency", () => {
    const { outcome } = questionOf([
      saleWithFiscal({
        kind: "offline_authorized",
        authorized: offlineAuthorized(FICTIONAL_ISSUER),
      }),
    ]);

    expect(outcome).toEqual({ kind: "asks" });
  });

  it.each([
    ["was already attempted", { printAttemptedAt: FIRST_PRINT_AT }],
    ["was printed", { printAttemptedAt: FIRST_PRINT_AT, printedAt: SENT_AT }],
    ["was declined", { printDeclinedAt: FIRST_PRINT_AT }],
  ])("prints without asking a factura C whose print %s", (_name, overrides) => {
    expect(questionOf([authorizedSale(FICTIONAL_ISSUER, overrides)]).outcome).toEqual({
      kind: "prints",
    });
  });

  it("prints without asking a receipt that always prints", () => {
    expect(questionOf([saleWithFiscal({ kind: "none" })]).outcome).toEqual({ kind: "prints" });
    expect(
      questionOf([
        saleWithFiscal({ kind: "deferred", deferred: { id: "0198-abc", shortCode: "7KQ4M2P9" } }),
      ]).outcome,
    ).toEqual({ kind: "prints" });
  });

  it("answers not found for a sale that is not completed or unknown", () => {
    expect(questionOf([completedSale({ completed: false })]).outcome).toEqual({
      kind: "not_found",
    });
    expect(questionOf([]).outcome).toEqual({ kind: "not_found" });
  });
});
