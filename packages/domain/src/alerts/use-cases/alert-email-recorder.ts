import type { AlertKind, AlertLevel } from "../model/alert-catalog.js";
import { isAlertEmailRecipient, sendsAlertEmailAt } from "../model/alert-email.js";
import { type AlertEmailStage, alertKindPolicy } from "../model/alert-kind-policy.js";
import type { AlertRecipientCandidate, AlertStoreTransaction } from "./alert-store.js";

export type AlertEmailRecorder = (
  alert: { alertId: string; kind: AlertKind; locationId: string | null },
  stage: AlertEmailStage,
  level: AlertLevel,
  occurredAt: Date,
) => Promise<void>;

export function alertEmailRecorder(
  tx: AlertStoreTransaction,
  knownViewers?: readonly AlertRecipientCandidate[],
): AlertEmailRecorder {
  let viewers = knownViewers;
  return async ({ alertId, kind, locationId }, stage, level, occurredAt) => {
    if (!sendsAlertEmailAt(kind, stage)) {
      return;
    }
    viewers ??= await tx.listActiveAlertViewers();
    const { audience } = alertKindPolicy(kind);
    const recipients = viewers.filter((viewer) =>
      isAlertEmailRecipient(viewer, { kind, audience, locationId }),
    );
    if (recipients.length > 0) {
      await tx.recordEmailDeliveries(
        alertId,
        { stage, level, occurredAt },
        recipients.map((recipient) => recipient.userId),
      );
    }
  };
}
