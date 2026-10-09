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
  const now = clock.now();
  const windowStart = paymentNotificationWindowStart(now);
  await admission.forgetNotificationsOutsideWindow(windowStart);

  return admission.transaction<AdmitPaymentNotificationOutcome>(async (tx) => {
    await tx.lockNotificationAttempts(sourceAddress);

    const retryAfterSeconds = paymentNotificationRetryAfterSeconds(
      await tx.admittedNotifications(sourceAddress, windowStart),
      now,
    );
    if (retryAfterSeconds !== undefined) {
      return { kind: "rate_limited", retryAfterSeconds };
    }
    await tx.recordAdmittedNotification(sourceAddress, now);
    return { kind: "admitted" };
  });
}
