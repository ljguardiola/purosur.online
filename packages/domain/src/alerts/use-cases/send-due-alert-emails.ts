import {
  ALERT_EMAIL_SEND_ATTEMPTS,
  alertEmailBranchName,
  nextAlertEmailAttemptAt,
} from "../model/alert-email.js";
import type { SendDueAlertEmailsPorts } from "./alert-email-delivery-ports.js";

export interface SendDueAlertEmailsOutcome {
  sent: number;
  retrying: number;
  failed: number;
}

export async function sendDueAlertEmails({
  lanes,
  sender,
  clock,
}: SendDueAlertEmailsPorts): Promise<SendDueAlertEmailsOutcome> {
  return lanes.inAlertEmailLane(async (store) => {
    const outcome: SendDueAlertEmailsOutcome = { sent: 0, retrying: 0, failed: 0 };
    for (const delivery of await store.dueEmailDeliveries(clock.now())) {
      const attempt = delivery.attemptsMade + 1;
      await store.recordEmailAttempt(delivery.deliveryId, {
        attempt,
        nextAttemptAt: nextAlertEmailAttemptAt(attempt, clock.now()),
      });
      const result = await sender.sendAlertEmail({
        deliveryId: delivery.deliveryId,
        to: delivery.to,
        alertId: delivery.alertId,
        kind: delivery.kind,
        stage: delivery.stage,
        level: delivery.level,
        branchName: alertEmailBranchName(delivery.alertBranchName, delivery.recipientBranchName),
        occurredAt: delivery.occurredAt,
      });
      if (result.kind === "sent") {
        await store.recordEmailSent(delivery.deliveryId, {
          sentAt: clock.now(),
          providerMessageId: result.providerMessageId,
        });
        outcome.sent += 1;
        continue;
      }
      const final = attempt >= ALERT_EMAIL_SEND_ATTEMPTS;
      await store.recordEmailFailure(delivery.deliveryId, { error: result.error, final });
      outcome[final ? "failed" : "retrying"] += 1;
    }
    return outcome;
  });
}
