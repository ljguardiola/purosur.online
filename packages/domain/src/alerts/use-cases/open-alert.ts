import type { OpenAlertInput } from "../model/alert-details.js";
import { escalatesAt } from "../model/alert-escalation.js";
import { alertKindPolicy } from "../model/alert-kind-policy.js";
import { alertLocationId, canSeeAlert } from "../model/alert-visibility.js";
import {
  AlertAlreadyOpenError,
  type AlertOpeningPorts,
  type AlertStoreTransaction,
  type NewAlert,
} from "./alert-store.js";

export type OpenAlertOutcome =
  | { kind: "opened"; alertId: string }
  | { kind: "already_open"; alertId: string };

export async function openAlert(
  { store, clock }: AlertOpeningPorts,
  input: OpenAlertInput,
): Promise<OpenAlertOutcome> {
  const openedAt = clock.now();
  return store.transaction((tx) => openAlertIn(tx, input, openedAt));
}

export async function openAlertIn(
  tx: AlertStoreTransaction,
  input: OpenAlertInput,
  openedAt: Date,
): Promise<OpenAlertOutcome> {
  const policy = alertKindPolicy(input.kind);
  const alert: NewAlert = {
    kind: input.kind,
    scope: input.scope,
    level: policy.level,
    audience: policy.audience,
    locationId: alertLocationId(policy.audience, input.locationId),
    detail: input.detail,
    openedAt,
    escalateAt: escalatesAt(input, openedAt),
    deduplicates: policy.deduplicates,
  };

  let alertId: string;
  try {
    alertId = await tx.insertAlert(alert);
  } catch (error) {
    if (error instanceof AlertAlreadyOpenError) {
      return { kind: "already_open", alertId: await openAlertId(tx, input) };
    }
    throw error;
  }
  const viewers = await tx.listActiveAlertViewers();
  const recipients = viewers.filter((viewer) => canSeeAlert(viewer, alert));
  if (recipients.length > 0) {
    await tx.recordBackofficeDeliveries(
      alertId,
      recipients.map((recipient) => recipient.userId),
    );
  }
  return { kind: "opened", alertId };
}

async function openAlertId(tx: AlertStoreTransaction, input: OpenAlertInput): Promise<string> {
  const alertId = await tx.findOpenAlertId(input.kind, input.scope);
  if (alertId === undefined) {
    throw new Error(
      `openAlert: dedup violation for ${input.kind}/${input.scope} but no open alert found`,
    );
  }
  return alertId;
}
