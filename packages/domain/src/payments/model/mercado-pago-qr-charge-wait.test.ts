import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  MERCADO_PAGO_QR_CHARGE_CHECK_INTERVAL_MS,
  MERCADO_PAGO_QR_CHARGE_WAIT_MINUTES,
  mercadoPagoQrChargeWait,
  mercadoPagoQrChargeWaitEndsAt,
} from "./mercado-pago-qr-charge-wait.js";
import { MERCADO_PAGO_ORDER_EXPIRY_MINUTES } from "./payment-transaction.js";

const STARTED_AT = new Date("2026-10-09T12:00:00.000Z");
const WAIT_ENDS_AT = new Date("2026-10-09T12:03:00.000Z");

describe("mercadoPagoQrChargeWaitEndsAt", () => {
  it("waits 3 minutes from the moment the charge starts", () => {
    expect(MERCADO_PAGO_QR_CHARGE_WAIT_MINUTES).toBe(3);
    expect(mercadoPagoQrChargeWaitEndsAt(STARTED_AT)).toEqual(WAIT_ENDS_AT);
  });

  it("ends the wait 2 minutes before the order expires, so a payment made at its end still comes in", () => {
    expect(MERCADO_PAGO_ORDER_EXPIRY_MINUTES - MERCADO_PAGO_QR_CHARGE_WAIT_MINUTES).toBe(2);
  });
});

describe("mercadoPagoQrChargeWait", () => {
  it("is still waiting with the whole wait left right after the charge starts", () => {
    expect(mercadoPagoQrChargeWait(WAIT_ENDS_AT, STARTED_AT)).toEqual({
      kind: "waiting",
      remainingSeconds: 180,
    });
  });

  it("counts a started second as a second still left", () => {
    expect(mercadoPagoQrChargeWait(WAIT_ENDS_AT, new Date("2026-10-09T12:02:59.001Z"))).toEqual({
      kind: "waiting",
      remainingSeconds: 1,
    });
  });

  it("is over the moment the wait ends", () => {
    expect(mercadoPagoQrChargeWait(WAIT_ENDS_AT, WAIT_ENDS_AT)).toEqual({ kind: "over" });
  });

  it("is over after the wait ends", () => {
    expect(mercadoPagoQrChargeWait(WAIT_ENDS_AT, new Date("2026-10-09T12:10:00.000Z"))).toEqual({
      kind: "over",
    });
  });

  it("never leaves more than the whole wait nor less than a second while waiting", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 400_000 }), (elapsedMs) => {
        const now = new Date(STARTED_AT.getTime() + elapsedMs);
        const wait = mercadoPagoQrChargeWait(mercadoPagoQrChargeWaitEndsAt(STARTED_AT), now);
        if (elapsedMs >= 180_000) {
          expect(wait).toEqual({ kind: "over" });
        } else {
          expect(wait.kind).toBe("waiting");
          if (wait.kind === "waiting") {
            expect(wait.remainingSeconds).toBeGreaterThanOrEqual(1);
            expect(wait.remainingSeconds).toBeLessThanOrEqual(180);
          }
        }
      }),
    );
  });
});

describe("MERCADO_PAGO_QR_CHARGE_CHECK_INTERVAL_MS", () => {
  it("asks the cloud for the order's state every 3 seconds, at most", () => {
    expect(MERCADO_PAGO_QR_CHARGE_CHECK_INTERVAL_MS).toBe(3_000);
  });
});
