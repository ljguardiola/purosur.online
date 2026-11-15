import type { ApplyQueriedAlertEmailStatusPorts } from "./alert-email-status-ports.js";

export interface ApplyQueriedAlertEmailStatusInput {
  providerMessageId: string;
}

export type ApplyQueriedAlertEmailStatusOutcome =
  | { kind: "not_an_alert_email" }
  | { kind: "provider_unavailable" }
  | { kind: "marked_undelivered"; deliveryId: string }
  | { kind: "delivered" }
  | { kind: "in_transit" };

export async function applyQueriedAlertEmailStatus(
  { store, statusQuery }: ApplyQueriedAlertEmailStatusPorts,
  { providerMessageId }: ApplyQueriedAlertEmailStatusInput,
): Promise<ApplyQueriedAlertEmailStatusOutcome> {
  const sent = await store.sentAlertEmailOfProviderMessage(providerMessageId);
  if (sent === undefined) {
    return { kind: "not_an_alert_email" };
  }
  const status = await statusQuery.queriedAlertEmailStatus(providerMessageId);
  if (status.kind === "undelivered") {
    await store.recordEmailUndelivered(sent.deliveryId);
    return { kind: "marked_undelivered", deliveryId: sent.deliveryId };
  }
  return status.kind === "unavailable" ? { kind: "provider_unavailable" } : { kind: status.kind };
}
