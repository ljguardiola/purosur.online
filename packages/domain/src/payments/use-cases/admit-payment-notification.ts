import {
  paymentNotificationRetryAfterSeconds,
  paymentNotificationWindowStart,
} from "../model/mercado-pago-notifications.js";
import type { PaymentNotificationAdmissionPorts } from "./mercado-pago-notification-ports.js";

export interface AdmitPaymentNotificationInput {
  sourceAddress: string;
}

export type AdmitPaymentNotificationOutcome =
  | { kind: "admitted" }
  | { kind: "rate_limited"; retryAfterSeconds: number };

export async function admitPaymentNotification(
  { admission, clock }: PaymentNotificationAdmissionPorts,
  { sourceAddress }: AdmitPaymentNotificationInput,
): Promise<AdmitPaymentNotificationOutcome> {
  return admission.transaction<AdmitPaymentNotificationOutcome>(async (tx) => {
    const now = clock.now();
    await tx.lockNotificationAttempts(sourceAddress);

    const windowStart = paymentNotificationWindowStart(now);
    const retryAfterSeconds = paymentNotificationRetryAfterSeconds(
      await tx.admittedNotifications(sourceAddress, windowStart),
      now,
    );
    if (retryAfterSeconds !== undefined) {
      return { kind: "rate_limited", retryAfterSeconds };
    }
    await tx.recordAdmittedNotification(sourceAddress, now);
    await tx.forgetNotificationsThrough(sourceAddress, windowStart);
    return { kind: "admitted" };
  });
}
