import { timingSafeEqual } from "node:crypto";
import type { SignInOutcome } from "@purosur/contracts";
import {
  decodePinSalt,
  holdsARegisterPermission,
  isLockedOutOfPinSignIn,
  PERMISSION_KEYS,
  pinSignInAttemptsLeft,
  pinSignInDelaySeconds,
  pinSignInRetryAfterSeconds,
} from "@purosur/domain";
import { derivePinVerifier } from "./pin-verifier";
import type { SignInStore } from "./sqlite-sign-in-store";

export interface SignInDeps {
  store: Pick<
    SignInStore,
    | "signInRecord"
    | "pinSignInFailures"
    | "recordPinSignInFailure"
    | "withdrawPinSignInFailure"
    | "clearPinSignInFailures"
  >;
  readPepper: () => Promise<string | undefined>;
  hashPin: (pin: string, salt: Uint8Array) => Promise<string>;
  now: () => Date;
}

function sameText(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export async function signIn(
  deps: SignInDeps,
  userId: string,
  pin: string,
): Promise<SignInOutcome> {
  const record = deps.store.signInRecord(userId);
  const salt = record === undefined ? undefined : decodePinSalt(record.salt);
  if (record === undefined || salt === undefined) {
    return { kind: "wrong_pin", retry_after_seconds: 0, attempts_left: pinSignInAttemptsLeft(1) };
  }
  const pepper = await deps.readPepper();
  const failures = deps.store.pinSignInFailures(userId);
  if (failures !== undefined) {
    if (isLockedOutOfPinSignIn(failures.consecutiveFailures)) {
      return { kind: "locked" };
    }
    const retryAfterSeconds = pinSignInRetryAfterSeconds(
      failures.consecutiveFailures,
      failures.lastFailedAt,
      deps.now(),
    );
    if (retryAfterSeconds > 0) {
      return {
        kind: "rate_limited",
        retry_after_seconds: retryAfterSeconds,
        attempts_left: pinSignInAttemptsLeft(failures.consecutiveFailures),
      };
    }
  }
  if (pepper === undefined) {
    return { kind: "unavailable" };
  }
  // Counted before hashing, with no await since the check above, so an attempt in flight
  // cannot let another one for the same person through the wait or the lockout.
  const failed = deps.store.recordPinSignInFailure(userId, deps.now());
  let pinHash: string;
  try {
    pinHash = await deps.hashPin(pin, salt);
  } catch (error) {
    deps.store.withdrawPinSignInFailure(userId);
    throw error;
  }
  const verifier = derivePinVerifier(pepper, pinHash);
  if (!sameText(verifier, record.verifier)) {
    if (isLockedOutOfPinSignIn(failed.consecutiveFailures)) {
      return { kind: "locked" };
    }
    return {
      kind: "wrong_pin",
      retry_after_seconds: pinSignInDelaySeconds(failed.consecutiveFailures),
      attempts_left: pinSignInAttemptsLeft(failed.consecutiveFailures),
    };
  }
  deps.store.clearPinSignInFailures(userId);
  if (!holdsARegisterPermission(record.access)) {
    return { kind: "no_register_permission" };
  }
  return {
    kind: "signed_in",
    person: {
      first_name: record.firstName,
      permission_keys: record.access.isAdministrator
        ? [...PERMISSION_KEYS]
        : [...record.access.permissionKeys],
    },
  };
}
