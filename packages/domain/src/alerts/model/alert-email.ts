import type { AlertAudience, AlertKind } from "./alert-catalog.js";
import { type AlertEmailStage, alertKindPolicy } from "./alert-kind-policy.js";
import { alertSightOf, canSeeAlert } from "./alert-visibility.js";

export const ALERT_EMAIL_SEND_ATTEMPTS = 5;

export const ALERT_EMAIL_FAILURE_REASONS = [
  "provider_refused",
  "provider_unreachable",
  "provider_unconfirmed",
  "provider_undelivered",
] as const;

export type AlertEmailFailureReason = (typeof ALERT_EMAIL_FAILURE_REASONS)[number];

export function isAlertEmailFailureReason(text: string): text is AlertEmailFailureReason {
  return (ALERT_EMAIL_FAILURE_REASONS as readonly string[]).includes(text);
}

export type AlertEmailProviderStatusMeaning = "undelivered" | "delivered" | "unchanged";

const ALERT_EMAIL_PROVIDER_STATUS_MEANINGS: ReadonlyMap<string, AlertEmailProviderStatusMeaning> =
  new Map([
    ["bounced", "undelivered"],
    ["failed", "undelivered"],
    ["suppressed", "undelivered"],
    ["canceled", "undelivered"],
    ["delivered", "delivered"],
    ["opened", "delivered"],
    ["clicked", "delivered"],
    ["complained", "delivered"],
  ]);

export function alertEmailProviderStatusMeaning(status: string): AlertEmailProviderStatusMeaning {
  return ALERT_EMAIL_PROVIDER_STATUS_MEANINGS.get(status) ?? "unchanged";
}

const FIRST_RETRY_DELAY_MS = 60 * 1000;

export interface AlertEmailCandidate {
  isAdministrator: boolean;
  permissionKeys: readonly string[];
  locationId: string;
  alertEmailOptedIn: boolean;
}

export function sendsAlertEmailAt(kind: AlertKind, stage: AlertEmailStage): boolean {
  return alertKindPolicy(kind).emailStages.includes(stage);
}

export function isAlertEmailRecipient(
  candidate: AlertEmailCandidate,
  alert: { kind: AlertKind; audience: AlertAudience; locationId: string | null },
): boolean {
  if (!candidate.alertEmailOptedIn) {
    return false;
  }
  return (
    alertSightOf(candidate).kind === "all" ||
    (alertKindPolicy(alert.kind).reachesLocalAlertViewers && canSeeAlert(candidate, alert))
  );
}

export function isAlertEmailDue(delivery: { nextAttemptAt: Date | null }, now: Date): boolean {
  return delivery.nextAttemptAt === null || delivery.nextAttemptAt <= now;
}

export function nextAlertEmailAttemptAt(failedAttempts: number, now: Date): Date {
  return new Date(now.getTime() + FIRST_RETRY_DELAY_MS * 2 ** (failedAttempts - 1));
}

export function alertEmailBranchName(alertBranchAddress: string | null): string | null {
  const address = alertBranchAddress?.trim();
  return address ? address : null;
}

export function stillReceivesAlertEmails(recipient: {
  active: boolean;
  alertEmailOptedIn: boolean;
}): boolean {
  return recipient.active && recipient.alertEmailOptedIn;
}
