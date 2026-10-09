import { describe, expect, it } from "vitest";
import {
  MERCADO_PAGO_PENDING_CHECK_INTERVAL_MS,
  PAYMENT_NOTIFICATION_LIMIT,
  PAYMENT_NOTIFICATION_WINDOW_MS,
  paymentNotificationRetryAfterSeconds,
  paymentNotificationWindowStart,
} from "./mercado-pago-notifications.js";

const NOW = new Date("2026-10-09T12:00:00.000Z");

function secondsAgo(seconds: number): Date {
  return new Date(NOW.getTime() - seconds * 1000);
}

describe("Mercado Pago notification policy", () => {
  it("re-reads the pending orders every 30 seconds", () => {
    expect(MERCADO_PAGO_PENDING_CHECK_INTERVAL_MS).toBe(30_000);
  });

  it("allows 120 notifications per origin in the last 60 seconds", () => {
    expect(PAYMENT_NOTIFICATION_LIMIT).toBe(120);
    expect(PAYMENT_NOTIFICATION_WINDOW_MS).toBe(60_000);
    expect(paymentNotificationWindowStart(NOW)).toEqual(secondsAgo(60));
  });

  it("admits a notification while fewer than the limit were admitted in the window", () => {
    const admitted = Array.from({ length: PAYMENT_NOTIFICATION_LIMIT - 1 }, () => secondsAgo(1));

    expect(paymentNotificationRetryAfterSeconds(admitted, NOW)).toBeUndefined();
  });

  it("refuses a notification at the limit until the oldest counted one leaves the window", () => {
    const admitted = [
      ...Array.from({ length: PAYMENT_NOTIFICATION_LIMIT - 1 }, () => secondsAgo(1)),
      secondsAgo(40),
    ];

    expect(paymentNotificationRetryAfterSeconds(admitted, NOW)).toBe(20);
  });
});
