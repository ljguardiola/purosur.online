import { hasValidPasskeyAuthorization } from "../../shared/index.js";
import type { AlertEmailOptInStore } from "./alert-email-opt-in-store.js";

export interface RecordOwnAlertEmailOptInPorts {
  store: AlertEmailOptInStore;
}

export interface RecordOwnAlertEmailOptInInput {
  userId: string;
  locationId: string;
  passkeyAuthorizedAt: Date | null;
  at: Date;
}

export type RecordOwnAlertEmailOptInOutcome =
  | { kind: "authorization_required" }
  | { kind: "not_found" }
  | { kind: "already_recorded"; optedInAt: Date }
  | { kind: "recorded"; optedInAt: Date };

export function recordOwnAlertEmailOptIn(
  { store }: RecordOwnAlertEmailOptInPorts,
  input: RecordOwnAlertEmailOptInInput,
): Promise<RecordOwnAlertEmailOptInOutcome> {
  if (!hasValidPasskeyAuthorization({ passkeyAuthorizedAt: input.passkeyAuthorizedAt }, input.at)) {
    return Promise.resolve({ kind: "authorization_required" });
  }
  return store.transaction<RecordOwnAlertEmailOptInOutcome>(async (tx) => {
    const current = await tx.lockBranchUserOptIn(input.userId, input.locationId);
    if (!current) {
      return { kind: "not_found" };
    }
    if (current.optedInAt) {
      return { kind: "already_recorded", optedInAt: current.optedInAt };
    }
    await tx.recordOptIn(input.userId, input.at);
    await tx.recordUserChange(input.userId, input.userId, {
      kind: "alert_email_opted_in",
      optedInAt: input.at,
    });
    await tx.openRecipientsChangedAlert({
      userId: input.userId,
      change: "opted_in",
      actorId: input.userId,
      openedAt: input.at,
    });
    return { kind: "recorded", optedInAt: input.at };
  });
}
