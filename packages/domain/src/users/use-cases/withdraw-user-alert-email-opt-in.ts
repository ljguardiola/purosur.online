import { hasValidPasskeyAuthorization } from "../../shared/index.js";
import { mayWithdrawAlertEmailOptInOf } from "../model/user-management.js";
import type { AlertEmailOptInStore } from "./alert-email-opt-in-store.js";
import { withdrawAlertEmailOptIn } from "./alert-email-opt-in-withdrawal.js";

export interface WithdrawUserAlertEmailOptInPorts {
  store: AlertEmailOptInStore;
}

export interface WithdrawUserAlertEmailOptInInput {
  locationId: string;
  administratorId: string;
  targetUserId: string;
  passkeyAuthorizedAt: Date | null;
  at: Date;
}

export type WithdrawUserAlertEmailOptInOutcome =
  | { kind: "authorization_required" }
  | { kind: "own_account" }
  | { kind: "user_not_found" }
  | { kind: "not_recorded" }
  | { kind: "withdrawn" };

export async function withdrawUserAlertEmailOptIn(
  { store }: WithdrawUserAlertEmailOptInPorts,
  input: WithdrawUserAlertEmailOptInInput,
): Promise<WithdrawUserAlertEmailOptInOutcome> {
  if (!hasValidPasskeyAuthorization({ passkeyAuthorizedAt: input.passkeyAuthorizedAt }, input.at)) {
    return { kind: "authorization_required" };
  }
  if (!mayWithdrawAlertEmailOptInOf(input.administratorId, { id: input.targetUserId })) {
    return { kind: "own_account" };
  }
  const outcome = await withdrawAlertEmailOptIn(store, {
    userId: input.targetUserId,
    locationId: input.locationId,
    actorId: input.administratorId,
    at: input.at,
  });
  return outcome.kind === "not_found" ? { kind: "user_not_found" } : outcome;
}
