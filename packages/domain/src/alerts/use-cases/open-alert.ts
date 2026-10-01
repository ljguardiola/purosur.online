import type { OpenAlertInput } from "../model/alert-details.js";
import { escalatesAt } from "../model/alert-escalation.js";
import { alertKindPolicy } from "../model/alert-kind-policy.js";
import { alertLocationId, canSeeAlert } from "../model/alert-visibility.js";
import { AlertAlreadyOpenError, type AlertOpeningPorts, type NewAlert } from "./alert-store.js";

export type OpenAlertOutcome =
  | { kind: "opened"; alertId: string }
  | { kind: "already_open"; alertId: string };

export async function openAlert(
  { store, clock }: AlertOpeningPorts,
  input: OpenAlertInput,
): Promise<OpenAlertOutcome> {
  const policy = alertKindPolicy(input.kind);
  const openedAt = clock.now();
  const alert: NewAlert = {
    kind: input.kind,
    scope: input.scope,
    level: policy.level,
    audience: policy.audience,
    locationId: alertLocationId(policy.audience, input.locationId),
    detail: input.detail,
    openedAt,
    escalateAt: escalatesAt(input.kind, openedAt),
    deduplicates: policy.deduplicates,
  };

  try {
    return await store.transaction(async (tx) => {
      const alertId = await tx.insertAlert(alert);
      const viewers = await tx.listActiveAlertViewers();
      const recipients = viewers.filter((viewer) => canSeeAlert(viewer, alert));
      if (recipients.length > 0) {
        await tx.recordBackofficeDeliveries(
          alertId,
          recipients.map((recipient) => recipient.userId),
        );
      }
      return { kind: "opened", alertId };
    });
  } catch (error) {
    if (!(error instanceof AlertAlreadyOpenError)) {
      throw error;
    }
  }

  return store.transaction(async (tx) => {
    const alertId = await tx.findOpenAlertId(input.kind, input.scope);
    if (alertId === undefined) {
      throw new Error(
        `openAlert: dedup violation for ${input.kind}/${input.scope} but no open alert found`,
      );
    }
    return { kind: "already_open", alertId };
  });
}
