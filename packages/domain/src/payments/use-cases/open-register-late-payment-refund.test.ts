import { describe, expect, it } from "vitest";
import { openRegisterLatePaymentRefund } from "./open-register-late-payment-refund.js";
import {
  mercadoPagoOrderWorld,
  NOW,
  REGISTER_ID,
  storedPointTransaction,
  storedTransaction,
  TRANSACTION_ID,
} from "./test-support/mercado-pago-order-fixtures.js";

const INPUT = { registerId: REGISTER_ID, paymentTransactionId: TRANSACTION_ID };

describe("openRegisterLatePaymentRefund", () => {
  it("opens one pending late payment refund of an approved order", async () => {
    const { lanes, ports } = mercadoPagoOrderWorld();
    lanes.seed(storedTransaction({ state: "APPROVED" }));

    expect(await openRegisterLatePaymentRefund(ports, INPUT)).toEqual({ kind: "opened" });

    expect([...lanes.latePaymentRefunds.values()]).toEqual([
      {
        refund: {
          paymentId: TRANSACTION_ID,
          method: "QR",
          provider: "MERCADOPAGO_QR",
          amount: 2500,
          state: "PENDING",
          origin: "late_payment",
          providerOrderId: null,
        },
        openedAt: NOW,
      },
    ]);
  });

  it("refunds an approved Point order through its own method and provider", async () => {
    const { lanes, ports } = mercadoPagoOrderWorld();
    lanes.seed(storedPointTransaction({ state: "APPROVED" }));

    await openRegisterLatePaymentRefund(ports, INPUT);

    const [opened] = [...lanes.latePaymentRefunds.values()];
    expect([opened?.refund.method, opened?.refund.provider]).toEqual([
      "POINT",
      "MERCADOPAGO_POINT",
    ]);
  });

  it("opens a single refund however many times it is asked", async () => {
    const { lanes, ports } = mercadoPagoOrderWorld();
    lanes.seed(storedTransaction({ state: "APPROVED" }));

    const first = await openRegisterLatePaymentRefund(ports, INPUT);
    const second = await openRegisterLatePaymentRefund(ports, INPUT);

    expect([first, second]).toEqual([{ kind: "opened" }, { kind: "already_open" }]);
    expect(lanes.latePaymentRefunds.size).toBe(1);
  });

  it("works inside the payment transaction's lane", async () => {
    const { lanes, ports } = mercadoPagoOrderWorld();
    lanes.seed(storedTransaction({ state: "APPROVED" }));

    await openRegisterLatePaymentRefund(ports, INPUT);

    expect(lanes.lanesEntered).toEqual([TRANSACTION_ID]);
    expect(lanes.operations).toEqual([
      "enterLane",
      "recordedTransaction",
      "openLatePaymentRefund",
      "leaveLane",
    ]);
  });

  it("answers not found for a payment that does not exist", async () => {
    const { lanes, ports } = mercadoPagoOrderWorld();

    expect(await openRegisterLatePaymentRefund(ports, INPUT)).toEqual({ kind: "not_found" });
    expect(lanes.latePaymentRefunds.size).toBe(0);
  });

  it("answers not found for a payment of another register", async () => {
    const { lanes, ports } = mercadoPagoOrderWorld();
    lanes.seed(storedTransaction({ state: "APPROVED", registerId: "register-2" }));

    expect(await openRegisterLatePaymentRefund(ports, INPUT)).toEqual({ kind: "not_found" });
    expect(lanes.latePaymentRefunds.size).toBe(0);
  });

  it.each(["PENDING", "DECLINED", "CANCELLED", "EXPIRED"] as const)(
    "refuses a %s payment",
    async (state) => {
      const { lanes, ports } = mercadoPagoOrderWorld();
      lanes.seed(storedTransaction({ state }));

      expect(await openRegisterLatePaymentRefund(ports, INPUT)).toEqual({ kind: "not_approved" });
      expect(lanes.latePaymentRefunds.size).toBe(0);
    },
  );

  it("refuses an approved payment another order replaced", async () => {
    const { lanes, ports } = mercadoPagoOrderWorld();
    lanes.seed(storedTransaction({ state: "APPROVED", replaced: true }));

    expect(await openRegisterLatePaymentRefund(ports, INPUT)).toEqual({ kind: "replaced" });
    expect(lanes.latePaymentRefunds.size).toBe(0);
  });
});
