import { hasValidPasskeyAuthorization } from "../../shared/index.js";
import type { AlertEmailOptInStore } from "./alert-email-opt-in-store.js";
import {
  type AlertEmailOptInWithdrawalOutcome,
  withdrawAlertEmailOptIn,
} from "./alert-email-opt-in-withdrawal.js";

export interface WithdrawOwnAlertEmailOptInPorts {
  store: AlertEmailOptInStore;
}

export interface WithdrawOwnAlertEmailOptInInput {
  userId: string;
  locationId: string;
  passkeyAuthorizedAt: Date | null;
  at: Date;
}

export type WithdrawOwnAlertEmailOptInOutcome =
  | { kind: "authorization_required" }
  | AlertEmailOptInWithdrawalOutcome;

export function withdrawOwnAlertEmailOptIn(
  { store }: WithdrawOwnAlertEmailOptInPorts,
  input: WithdrawOwnAlertEmailOptInInput,
): Promise<WithdrawOwnAlertEmailOptInOutcome> {
  if (!hasValidPasskeyAuthorization({ passkeyAuthorizedAt: input.passkeyAuthorizedAt }, input.at)) {
    return Promise.resolve({ kind: "authorization_required" });
  }
  return withdrawAlertEmailOptIn(store, {
    userId: input.userId,
    locationId: input.locationId,
    actorId: input.userId,
    at: input.at,
  });
}
