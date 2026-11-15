import type { AlertEmailOptInStore } from "./alert-email-opt-in-store.js";

export type AlertEmailOptInWithdrawalOutcome =
  | { kind: "not_found" }
  | { kind: "not_recorded" }
  | { kind: "withdrawn" };

export function withdrawAlertEmailOptIn(
  store: AlertEmailOptInStore,
  withdrawal: { userId: string; locationId: string; actorId: string; at: Date },
): Promise<AlertEmailOptInWithdrawalOutcome> {
  return store.transaction<AlertEmailOptInWithdrawalOutcome>(async (tx) => {
    const current = await tx.lockBranchUserOptIn(withdrawal.userId, withdrawal.locationId);
    if (!current) {
      return { kind: "not_found" };
    }
    if (!current.optedInAt) {
      return { kind: "not_recorded" };
    }
    await tx.clearOptIn(withdrawal.userId);
    await tx.recordUserChange(withdrawal.userId, withdrawal.actorId, {
      kind: "alert_email_opt_in_withdrawn",
      optedInAt: current.optedInAt,
    });
    await tx.openRecipientsChangedAlert({
      userId: withdrawal.userId,
      change: "withdrawn",
      actorId: withdrawal.actorId,
      openedAt: withdrawal.at,
    });
    return { kind: "withdrawn" };
  });
}
