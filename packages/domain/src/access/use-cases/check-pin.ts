import {
  isLockedOutOfPinSignIn,
  PIN_SIGN_IN_LOCKOUT_FAILURES,
  pinSignInAttemptsLeft,
  pinSignInDelaySeconds,
  pinSignInRetryAfterSeconds,
} from "../model/pin-sign-in-failures.js";
import type { PinCheckPorts } from "./pin-sign-in-store.js";

export interface CheckPinInput<Credential> {
  userId: string;
  credential: Credential;
  pin: string;
}

export type PinRefusal =
  | { kind: "locked"; consecutiveFailures: number }
  | { kind: "rate_limited"; retryAfterSeconds: number; attemptsLeft: number }
  | { kind: "wrong_pin"; retryAfterSeconds: number; attemptsLeft: number };

export type CheckPinOutcome = { kind: "right_pin" } | PinRefusal | { kind: "unavailable" };

const LOCKED: PinRefusal = {
  kind: "locked",
  consecutiveFailures: PIN_SIGN_IN_LOCKOUT_FAILURES,
};

export async function checkPin<Credential>(
  { store, matching, clock }: PinCheckPorts<Credential>,
  { userId, credential, pin }: CheckPinInput<Credential>,
): Promise<CheckPinOutcome> {
  const matcher = await matching.matcher();
  const failures = store.pinSignInFailures(userId);
  if (failures !== undefined) {
    if (isLockedOutOfPinSignIn(failures.consecutiveFailures)) {
      return LOCKED;
    }
    const retryAfterSeconds = pinSignInRetryAfterSeconds(
      failures.consecutiveFailures,
      failures.lastFailedAt,
      clock.now(),
    );
    if (retryAfterSeconds > 0) {
      return {
        kind: "rate_limited",
        retryAfterSeconds,
        attemptsLeft: pinSignInAttemptsLeft(failures.consecutiveFailures),
      };
    }
  }
  if (matcher === undefined) {
    return { kind: "unavailable" };
  }
  // Counted before matching, with no await since the check above, so an attempt in flight
  // cannot let another one for the same person through the wait or the lockout.
  const failed = store.recordPinSignInFailure(userId, clock.now());
  let matches: boolean;
  try {
    matches = await matcher.matches(pin, credential);
  } catch (error) {
    store.withdrawPinSignInFailure(userId);
    throw error;
  }
  if (!matches) {
    if (isLockedOutOfPinSignIn(failed.consecutiveFailures)) {
      return LOCKED;
    }
    return {
      kind: "wrong_pin",
      retryAfterSeconds: pinSignInDelaySeconds(failed.consecutiveFailures),
      attemptsLeft: pinSignInAttemptsLeft(failed.consecutiveFailures),
    };
  }
  store.clearPinSignInFailures(userId);
  return { kind: "right_pin" };
}
