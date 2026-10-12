import { describe, expect, it } from "vitest";
import { applyQrPaymentReplacement } from "./apply-qr-payment-replacement.js";
import {
  FakeQrPaymentReplacements,
  type FakeRecordedQrPayment,
} from "./test-support/fake-qr-payment-replacements.js";
import { FixedClock } from "./test-support/fake-refund-store.js";

const NOW = new Date("2026-10-09T12:00:00.000Z");
const REPLACEMENT = {
  registerId: "register-1",
  paymentTransactionId: "transaction-1",
  saleId: "sale-1",
};

function payment(overrides: Partial<FakeRecordedQrPayment> = {}): FakeRecordedQrPayment {
  return {
    id: "transaction-1",
    registerId: "register-1",
    saleId: "sale-1",
    method: "QR",
    provider: "MERCADOPAGO_QR",
    amount: 2500,
    state: "PENDING",
    replaced: false,
    ...overrides,
  };
}

function apply(store: FakeQrPaymentReplacements, replacement = REPLACEMENT) {
  return applyQrPaymentReplacement({ store, clock: new FixedClock(NOW) }, replacement);
}

describe("applyQrPaymentReplacement", () => {
  it("marks a payment the provider had already approved as replaced and opens its pending refund task by the payment's own channel, in one transaction", async () => {
    const store = new FakeQrPaymentReplacements([
      payment({ state: "APPROVED", method: "TRANSFER", provider: "SOME_PROVIDER", amount: 4100 }),
    ]);

    const outcome = await apply(store);

    expect(outcome).toEqual({ kind: "late_payment_refund_opened" });
    expect(store.payments[0]?.replaced).toBe(true);
    expect(store.refunds).toEqual([
      {
        refund: {
          paymentId: "transaction-1",
          method: "TRANSFER",
          provider: "SOME_PROVIDER",
          amount: 4100,
          state: "PENDING",
          origin: "late_payment",
          providerOrderId: null,
        },
        openedAt: NOW,
      },
    ]);
    expect(store.operations).toEqual(["markReplaced", "openLatePaymentRefund"]);
    expect(store.transactions).toBe(1);
  });

  it("marks a payment the provider has not approved as replaced and opens no task", async () => {
    const store = new FakeQrPaymentReplacements([payment({ state: "PENDING" })]);

    const outcome = await apply(store);

    expect(outcome).toEqual({ kind: "replaced" });
    expect(store.payments[0]?.replaced).toBe(true);
    expect(store.refunds).toEqual([]);
    expect(store.operations).toEqual(["markReplaced"]);
  });

  it("opens a single task when the same replacement is applied twice", async () => {
    const store = new FakeQrPaymentReplacements([payment({ state: "APPROVED" })]);

    await apply(store);
    const again = await apply(store);

    expect(again).toEqual({ kind: "late_payment_refund_already_open" });
    expect(store.refunds).toHaveLength(1);
  });

  it("answers not recorded, opening nothing, for a payment another register or sale holds or nobody recorded", async () => {
    const store = new FakeQrPaymentReplacements([payment({ state: "APPROVED" })]);

    expect(await apply(store, { ...REPLACEMENT, registerId: "register-2" })).toEqual({
      kind: "not_recorded",
    });
    expect(await apply(store, { ...REPLACEMENT, saleId: "sale-2" })).toEqual({
      kind: "not_recorded",
    });
    expect(await apply(store, { ...REPLACEMENT, paymentTransactionId: "transaction-9" })).toEqual({
      kind: "not_recorded",
    });
    expect(store.payments[0]?.replaced).toBe(false);
    expect(store.refunds).toEqual([]);
    expect(store.operations).toEqual(["markReplaced", "markReplaced", "markReplaced"]);
  });

  it("leaves the payment unmarked when its refund task cannot be opened", async () => {
    const store = new FakeQrPaymentReplacements([payment({ state: "APPROVED" })]);
    store.failOn = "openLatePaymentRefund";

    await expect(apply(store)).rejects.toThrow("openLatePaymentRefund failed");

    expect(store.payments[0]?.replaced).toBe(false);
    expect(store.refunds).toEqual([]);
  });
});
