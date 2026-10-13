import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  aMercadoPagoChargeInProgress,
  MERCADO_PAGO_ORDER_CHARGE_CHECK_INTERVAL_MS,
  MERCADO_PAGO_ORDER_CHARGE_WAIT_MINUTES,
  mercadoPagoChargeInProgress,
  mercadoPagoOrderChargeRemainingSeconds,
  mercadoPagoOrderChargeWait,
  mercadoPagoOrderChargeWaitEndsAt,
  mercadoPagoOrderChargeWaitSeconds,
} from "./mercado-pago-order-charge-wait.js";
import { mercadoPagoOrderExpiresAt } from "./payment-transaction.js";

const STARTED_AT = new Date("2026-10-09T12:00:00.000Z");
const WAIT_ENDS_AT = new Date("2026-10-09T12:03:00.000Z");

describe("mercadoPagoOrderChargeWaitEndsAt", () => {
  it("waits 3 minutes from the moment the charge starts", () => {
    expect(MERCADO_PAGO_ORDER_CHARGE_WAIT_MINUTES).toBe(3);
    expect(mercadoPagoOrderChargeWaitEndsAt(STARTED_AT)).toEqual(WAIT_ENDS_AT);
  });

  it("asks Mercado Pago to expire the order exactly when the wait ends", () => {
    const attemptStartedAt = new Date("2026-10-09T12:00:00.000Z");

    expect(
      mercadoPagoOrderExpiresAt(
        attemptStartedAt,
        MERCADO_PAGO_ORDER_CHARGE_WAIT_MINUTES,
        0,
      ).getTime() - mercadoPagoOrderChargeWaitEndsAt(attemptStartedAt).getTime(),
    ).toBe(0);
    expect(MERCADO_PAGO_ORDER_CHARGE_WAIT_MINUTES).toBe(3);
  });
});

describe("mercadoPagoOrderChargeWaitSeconds", () => {
  it("is the whole wait of a charge, from its start to the end of its wait", () => {
    expect(mercadoPagoOrderChargeWaitSeconds(STARTED_AT, WAIT_ENDS_AT)).toBe(180);
    expect(
      mercadoPagoOrderChargeWaitSeconds(STARTED_AT, new Date("2026-10-09T12:03:10.000Z")),
    ).toBe(190);
  });

  it("counts a started second of the wait as a whole second", () => {
    expect(
      mercadoPagoOrderChargeWaitSeconds(STARTED_AT, new Date("2026-10-09T12:03:10.001Z")),
    ).toBe(191);
  });

  it("is no wait when the wait ended before the charge started", () => {
    expect(
      mercadoPagoOrderChargeWaitSeconds(STARTED_AT, new Date("2026-10-09T11:59:00.000Z")),
    ).toBe(0);
    expect(mercadoPagoOrderChargeWaitSeconds(STARTED_AT, STARTED_AT)).toBe(0);
  });

  it("never leaves more time than the whole wait", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 400_000 }),
        fc.integer({ min: 0, max: 400_000 }),
        (waitMs, elapsedMs) => {
          const waitEndsAt = new Date(STARTED_AT.getTime() + waitMs);
          const now = new Date(STARTED_AT.getTime() + elapsedMs);
          expect(mercadoPagoOrderChargeRemainingSeconds(waitEndsAt, now)).toBeLessThanOrEqual(
            mercadoPagoOrderChargeWaitSeconds(STARTED_AT, waitEndsAt),
          );
        },
      ),
    );
  });
});

describe("mercadoPagoOrderChargeRemainingSeconds", () => {
  it("counts a started second as a second still left", () => {
    expect(
      mercadoPagoOrderChargeRemainingSeconds(WAIT_ENDS_AT, new Date("2026-10-09T12:02:59.001Z")),
    ).toBe(1);
  });

  it("is 0 the moment the wait ends and after it", () => {
    expect(mercadoPagoOrderChargeRemainingSeconds(WAIT_ENDS_AT, WAIT_ENDS_AT)).toBe(0);
    expect(
      mercadoPagoOrderChargeRemainingSeconds(WAIT_ENDS_AT, new Date("2026-10-09T12:10:00.000Z")),
    ).toBe(0);
  });
});

describe("mercadoPagoOrderChargeWait", () => {
  it("is still waiting with the whole wait left right after the charge starts", () => {
    expect(mercadoPagoOrderChargeWait(WAIT_ENDS_AT, STARTED_AT)).toEqual({
      kind: "waiting",
      remainingSeconds: 180,
    });
  });

  it("counts a started second as a second still left", () => {
    expect(mercadoPagoOrderChargeWait(WAIT_ENDS_AT, new Date("2026-10-09T12:02:59.001Z"))).toEqual({
      kind: "waiting",
      remainingSeconds: 1,
    });
  });

  it("is over the moment the wait ends", () => {
    expect(mercadoPagoOrderChargeWait(WAIT_ENDS_AT, WAIT_ENDS_AT)).toEqual({ kind: "over" });
  });

  it("is over after the wait ends", () => {
    expect(mercadoPagoOrderChargeWait(WAIT_ENDS_AT, new Date("2026-10-09T12:10:00.000Z"))).toEqual({
      kind: "over",
    });
  });

  it("never leaves more than the whole wait nor less than a second while waiting", () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 400_000 }), (elapsedMs) => {
        const now = new Date(STARTED_AT.getTime() + elapsedMs);
        const wait = mercadoPagoOrderChargeWait(mercadoPagoOrderChargeWaitEndsAt(STARTED_AT), now);
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

describe("MERCADO_PAGO_ORDER_CHARGE_CHECK_INTERVAL_MS", () => {
  it("asks the cloud for the order's state every 3 seconds, at most", () => {
    expect(MERCADO_PAGO_ORDER_CHARGE_CHECK_INTERVAL_MS).toBe(3_000);
  });
});

describe("aMercadoPagoChargeInProgress", () => {
  const qr = (waitEndsAt: Date) => ({ method: "QR", waitEndsAt }) as const;
  const point = (waitEndsAt: Date) => ({ method: "POINT", waitEndsAt }) as const;
  const OVER = new Date("2026-10-09T11:59:00.000Z");

  it("is false for a sale with no pending Mercado Pago payment", () => {
    expect(aMercadoPagoChargeInProgress([], STARTED_AT)).toBe(false);
  });

  it("is true while a pending QR payment's wait has not ended", () => {
    expect(aMercadoPagoChargeInProgress([qr(WAIT_ENDS_AT)], STARTED_AT)).toBe(true);
  });

  it("is false once every pending QR payment's wait has ended", () => {
    expect(aMercadoPagoChargeInProgress([qr(OVER), qr(WAIT_ENDS_AT)], WAIT_ENDS_AT)).toBe(false);
  });

  it("is true when any of several pending QR payments is still in its wait", () => {
    expect(aMercadoPagoChargeInProgress([qr(OVER), qr(WAIT_ENDS_AT)], STARTED_AT)).toBe(true);
  });

  it("is true while a pending terminal payment's wait has not ended", () => {
    expect(aMercadoPagoChargeInProgress([point(WAIT_ENDS_AT)], STARTED_AT)).toBe(true);
  });

  it("stays true for a pending terminal payment after its wait, until the payment is closed", () => {
    expect(aMercadoPagoChargeInProgress([point(OVER)], WAIT_ENDS_AT)).toBe(true);
  });
});

describe("mercadoPagoChargeInProgress", () => {
  const OVER = new Date("2026-10-09T11:59:00.000Z");
  const pending = (
    id: string,
    method: "QR" | "POINT",
    waitEndsAt: Date,
    occurredAt = new Date(waitEndsAt.getTime() - 180_000),
  ) => ({
    id,
    method,
    amount: 3000,
    occurredAt,
    waitEndsAt,
  });

  it("is none for a sale with no pending Mercado Pago payment", () => {
    expect(mercadoPagoChargeInProgress([], STARTED_AT)).toBeNull();
  });

  it("is none once every pending QR payment's wait has ended", () => {
    expect(mercadoPagoChargeInProgress([pending("qr-1", "QR", OVER)], STARTED_AT)).toBeNull();
  });

  it("names the QR payment still in its wait, with its amount, the seconds left and its whole wait up to the order's expiry", () => {
    expect(
      mercadoPagoChargeInProgress(
        [
          pending("qr-1", "QR", OVER),
          pending("qr-2", "QR", new Date("2026-10-09T12:03:10.000Z"), STARTED_AT),
        ],
        new Date("2026-10-09T12:01:00.000Z"),
      ),
    ).toEqual({
      paymentTransactionId: "qr-2",
      method: "QR",
      amount: 3000,
      remainingSeconds: 130,
      waitSeconds: 190,
    });
  });

  it("names a pending terminal payment after its wait, with no time left", () => {
    expect(mercadoPagoChargeInProgress([pending("point-1", "POINT", OVER)], WAIT_ENDS_AT)).toEqual({
      paymentTransactionId: "point-1",
      method: "POINT",
      amount: 3000,
      remainingSeconds: 0,
      waitSeconds: 180,
    });
  });
});
