import type { AlertAudience, AlertKind } from "./alert-catalog.js";
import { type AlertEmailStage, alertKindPolicy } from "./alert-kind-policy.js";
import { alertSightOf, canSeeAlert } from "./alert-visibility.js";

export const ALERT_EMAIL_SEND_ATTEMPTS = 5;

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

export function alertEmailBranchName(
  alertBranchName: string | null,
  recipientBranchName: string,
): string {
  return alertBranchName ?? recipientBranchName;
}
