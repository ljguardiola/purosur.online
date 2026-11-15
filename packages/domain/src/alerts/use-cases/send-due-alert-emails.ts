import {
  ALERT_EMAIL_SEND_ATTEMPTS,
  alertEmailBranchName,
  isAlertEmailDue,
  nextAlertEmailAttemptAt,
  stillReceivesAlertEmails,
} from "../model/alert-email.js";
import type {
  AlertEmailBranchReader,
  PendingAlertEmailDelivery,
  SendDueAlertEmailsPorts,
} from "./alert-email-delivery-ports.js";

export type SendDueAlertEmailsOutcome =
  | { kind: "ran"; sent: number; retrying: number; failed: number; skipped: number }
  | { kind: "lane_busy" };

async function branchNameOf(
  branches: AlertEmailBranchReader,
  delivery: PendingAlertEmailDelivery,
): Promise<string | null> {
  return delivery.alertLocationId === null
    ? null
    : alertEmailBranchName(await branches.alertEmailBranchAddress(delivery.alertLocationId));
}

export async function sendDueAlertEmails({
  lanes,
  recipients,
  branches,
  sender,
  clock,
}: SendDueAlertEmailsPorts): Promise<SendDueAlertEmailsOutcome> {
  const run = await lanes.inAlertEmailLane(async (store) => {
    const counts = { sent: 0, retrying: 0, failed: 0, skipped: 0 };
    const now = clock.now();
    const pending = await store.pendingEmailDeliveries();
    for (const delivery of pending.filter((candidate) => isAlertEmailDue(candidate, now))) {
      if (delivery.attemptsMade >= ALERT_EMAIL_SEND_ATTEMPTS) {
        await store.recordEmailGivenUp(delivery.deliveryId);
        counts.failed += 1;
        continue;
      }
      const recipient = await recipients.alertEmailRecipient(delivery.recipientUserId);
      if (recipient === undefined || !stillReceivesAlertEmails(recipient)) {
        await store.recordEmailSkipped(delivery.deliveryId);
        counts.skipped += 1;
        continue;
      }
      const branchName = await branchNameOf(branches, delivery);
      const attempt = delivery.attemptsMade + 1;
      await store.recordEmailAttempt(delivery.deliveryId, {
        attempt,
        nextAttemptAt: nextAlertEmailAttemptAt(attempt, clock.now()),
      });
      const result = await sender.sendAlertEmail({
        deliveryId: delivery.deliveryId,
        to: recipient.email,
        alertId: delivery.alertId,
        kind: delivery.kind,
        stage: delivery.stage,
        level: delivery.level,
        branchName,
        occurredAt: delivery.occurredAt,
      });
      if (result.kind === "sent") {
        await store.recordEmailSent(delivery.deliveryId, {
          sentAt: clock.now(),
          providerMessageId: result.providerMessageId,
        });
        counts.sent += 1;
        continue;
      }
      const final = attempt >= ALERT_EMAIL_SEND_ATTEMPTS;
      await store.recordEmailFailure(delivery.deliveryId, { reason: result.reason, final });
      counts[final ? "failed" : "retrying"] += 1;
    }
    return counts;
  });
  return run.kind === "busy" ? { kind: "lane_busy" } : { kind: "ran", ...run.result };
}
