import { alertEmailProviderStatusMeaning } from "../model/alert-email.js";
import type { ApplyQueriedAlertEmailStatusPorts } from "./alert-email-status-ports.js";

export interface ApplyQueriedAlertEmailStatusInput {
  providerMessageId: string;
}

export type ApplyQueriedAlertEmailStatusOutcome =
  | { kind: "not_an_alert_email" }
  | { kind: "not_a_sent_alert_email" }
  | { kind: "send_not_yet_recorded" }
  | { kind: "provider_unavailable" }
  | { kind: "marked_undelivered"; deliveryId: string }
  | { kind: "delivered" }
  | { kind: "unchanged" };

export async function applyQueriedAlertEmailStatus(
  { store, statusQuery }: ApplyQueriedAlertEmailStatusPorts,
  { providerMessageId }: ApplyQueriedAlertEmailStatusInput,
): Promise<ApplyQueriedAlertEmailStatusOutcome> {
  const answer = await statusQuery.queriedAlertEmailStatus(providerMessageId);
  if (answer.kind === "unavailable") {
    return { kind: "provider_unavailable" };
  }
  const { alertDeliveryId } = answer;
  if (alertDeliveryId !== null && (await store.isAlertEmailDeliveryPending(alertDeliveryId))) {
    return { kind: "send_not_yet_recorded" };
  }
  const sent = await store.sentAlertEmailOfProviderMessage(providerMessageId);
  if (sent === undefined) {
    return alertDeliveryId === null
      ? { kind: "not_an_alert_email" }
      : { kind: "not_a_sent_alert_email" };
  }
  const meaning = alertEmailProviderStatusMeaning(answer.status);
  if (meaning === "undelivered") {
    await store.recordEmailUndelivered(sent.deliveryId);
    return { kind: "marked_undelivered", deliveryId: sent.deliveryId };
  }
  return { kind: meaning };
}
