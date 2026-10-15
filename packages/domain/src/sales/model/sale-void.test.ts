import { describe, expect, it } from "vitest";
import { PAYMENT_METHODS } from "../../payments/index.js";
import { SALE_VOID_REFUSALS, type SaleVoidFacts, saleVoidRefusal } from "./sale-void.js";

const VOIDABLE: SaleVoidFacts = {
  state: "COMPLETED",
  inOpenSession: true,
  fiscalDocumentStates: [],
  approvedPaymentMethods: ["CASH"],
};

function facts(changes: Partial<SaleVoidFacts>): SaleVoidFacts {
  return { ...VOIDABLE, ...changes };
}

describe("SALE_VOID_REFUSALS", () => {
  it("lists every reason a sale cannot be voided, in the order they are checked", () => {
    expect(SALE_VOID_REFUSALS).toEqual([
      "not_completed",
      "session_closed",
      "invoice_in_flight",
      "carries_invoice",
      "mercado_pago_payment",
    ]);
  });
});

describe("saleVoidRefusal", () => {
  it("lets a completed sale of the open session paid in cash be voided", () => {
    expect(saleVoidRefusal(VOIDABLE)).toBeNull();
  });

  it.each(["TRANSFER", "STANDALONE_TERMINAL"] as const)(
    "lets a sale paid by %s be voided",
    (method) => {
      expect(saleVoidRefusal(facts({ approvedPaymentMethods: [method] }))).toBeNull();
    },
  );

  it("lets a sale be voided whose invoice request was rejected, released or in conflict", () => {
    expect(
      saleVoidRefusal(facts({ fiscalDocumentStates: ["REJECTED", "RELEASED", "CONFLICTING"] })),
    ).toBeNull();
  });

  it("lets a sale with no payment be voided", () => {
    expect(saleVoidRefusal(facts({ approvedPaymentMethods: [] }))).toBeNull();
  });

  it.each(["OPEN", "VOIDED", "CANCELLED"] as const)(
    "refuses a %s sale as not completed",
    (state) => {
      expect(saleVoidRefusal(facts({ state }))).toBe("not_completed");
    },
  );

  it("refuses a sale whose cash session is not the open one", () => {
    expect(saleVoidRefusal(facts({ inOpenSession: false }))).toBe("session_closed");
  });

  it.each(["REQUESTING", "UNKNOWN"] as const)(
    "refuses a sale whose invoice is %s as in flight",
    (state) => {
      expect(saleVoidRefusal(facts({ fiscalDocumentStates: [state] }))).toBe("invoice_in_flight");
    },
  );

  it("refuses a sale that carries an authorized invoice", () => {
    expect(saleVoidRefusal(facts({ fiscalDocumentStates: ["AUTHORIZED"] }))).toBe(
      "carries_invoice",
    );
  });

  it("refuses a sale with an authorized invoice among other documents", () => {
    expect(saleVoidRefusal(facts({ fiscalDocumentStates: ["REJECTED", "AUTHORIZED"] }))).toBe(
      "carries_invoice",
    );
  });

  it.each(["QR", "POINT"] as const)("refuses a sale with an approved %s payment", (method) => {
    expect(saleVoidRefusal(facts({ approvedPaymentMethods: ["CASH", method] }))).toBe(
      "mercado_pago_payment",
    );
  });

  it("accepts every payment method but Mercado Pago's", () => {
    const others = PAYMENT_METHODS.filter((method) => method !== "QR" && method !== "POINT");

    expect(saleVoidRefusal(facts({ approvedPaymentMethods: others }))).toBeNull();
  });

  it("answers not completed before a closed session", () => {
    expect(saleVoidRefusal(facts({ state: "VOIDED", inOpenSession: false }))).toBe("not_completed");
  });

  it("answers a closed session before an invoice in flight", () => {
    expect(
      saleVoidRefusal(facts({ inOpenSession: false, fiscalDocumentStates: ["REQUESTING"] })),
    ).toBe("session_closed");
  });

  it("answers an invoice in flight before an invoice carried", () => {
    expect(saleVoidRefusal(facts({ fiscalDocumentStates: ["AUTHORIZED", "REQUESTING"] }))).toBe(
      "invoice_in_flight",
    );
  });

  it("answers an invoice carried before a Mercado Pago payment", () => {
    expect(
      saleVoidRefusal(
        facts({ fiscalDocumentStates: ["AUTHORIZED"], approvedPaymentMethods: ["QR"] }),
      ),
    ).toBe("carries_invoice");
  });
});
