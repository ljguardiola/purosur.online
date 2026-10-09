import {
  type SlidingWindowLimit,
  slidingWindowRetryAfterSeconds,
  slidingWindowStart,
} from "../../shared/index.js";

export const MERCADO_PAGO_PENDING_CHECK_INTERVAL_MS = 30_000;

export const PAYMENT_NOTIFICATION_WINDOW_MS = 60_000;

export const PAYMENT_NOTIFICATION_LIMIT = 120;

const POLICY: SlidingWindowLimit = {
  limit: PAYMENT_NOTIFICATION_LIMIT,
  windowMs: PAYMENT_NOTIFICATION_WINDOW_MS,
};

export function paymentNotificationWindowStart(now: Date): Date {
  return slidingWindowStart(now, POLICY);
}

export function paymentNotificationRetryAfterSeconds(
  admittedNotifications: readonly Date[],
  now: Date,
): number | undefined {
  return slidingWindowRetryAfterSeconds(admittedNotifications, now, POLICY);
}
