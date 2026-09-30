import { timingSafeEqual } from "node:crypto";
import type { PinAttemptRefusal } from "@purosur/contracts";
import {
  decodePinSalt,
  isLockedOutOfPinSignIn,
  PIN_SIGN_IN_LOCKOUT_FAILURES,
  pinSignInAttemptsLeft,
  pinSignInDelaySeconds,
  pinSignInRetryAfterSeconds,
} from "@purosur/domain";
import { derivePinVerifier } from "./pin-verifier";
import type { SignInRecord, SignInStore } from "./sqlite-sign-in-store";

export interface PinCheckDeps {
  store: Pick<SignInStore, "signInRecord">;
  readPepper: () => Promise<string | undefined>;
  hashPin: (pin: string, salt: Uint8Array) => Promise<string>;
}

export interface SignableRecord {
  record: SignInRecord;
  salt: Uint8Array;
}

export type PinCheck = { kind: "right_pin" } | { kind: "wrong_pin" } | { kind: "unavailable" };

function sameText(left: string, right: string): boolean {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}

export function pinMatches(pepper: string, pinHash: string, record: SignInRecord): boolean {
  return sameText(derivePinVerifier(pepper, pinHash), record.verifier);
}

export function signableRecord(
  store: PinCheckDeps["store"],
  userId: string,
): SignableRecord | undefined {
  const record = store.signInRecord(userId);
  const salt = record === undefined ? undefined : decodePinSalt(record.salt);
  return record === undefined || salt === undefined ? undefined : { record, salt };
}

export interface CountedPinCheckDeps {
  store: Pick<
    SignInStore,
    | "pinSignInFailures"
    | "recordPinSignInFailure"
    | "withdrawPinSignInFailure"
    | "clearPinSignInFailures"
  >;
  readPepper: () => Promise<string | undefined>;
  hashPin: (pin: string, salt: Uint8Array) => Promise<string>;
  now: () => Date;
}

export type CountedPinCheck = { kind: "right_pin" } | PinAttemptRefusal | { kind: "unavailable" };

export async function checkCountedPin(
  deps: CountedPinCheckDeps,
  userId: string,
  { record, salt }: SignableRecord,
  pin: string,
): Promise<CountedPinCheck> {
  const pepper = await deps.readPepper();
  const failures = deps.store.pinSignInFailures(userId);
  if (failures !== undefined) {
    if (isLockedOutOfPinSignIn(failures.consecutiveFailures)) {
      return { kind: "locked", consecutive_failures: PIN_SIGN_IN_LOCKOUT_FAILURES };
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
  if (!pinMatches(pepper, pinHash, record)) {
    if (isLockedOutOfPinSignIn(failed.consecutiveFailures)) {
      return { kind: "locked", consecutive_failures: PIN_SIGN_IN_LOCKOUT_FAILURES };
    }
    return {
      kind: "wrong_pin",
      retry_after_seconds: pinSignInDelaySeconds(failed.consecutiveFailures),
      attempts_left: pinSignInAttemptsLeft(failed.consecutiveFailures),
    };
  }
  deps.store.clearPinSignInFailures(userId);
  return { kind: "right_pin" };
}

export async function checkPin(
  deps: Omit<PinCheckDeps, "store">,
  { record, salt }: SignableRecord,
  pin: string,
): Promise<PinCheck> {
  const pepper = await deps.readPepper();
  if (pepper === undefined) {
    return { kind: "unavailable" };
  }
  return pinMatches(pepper, await deps.hashPin(pin, salt), record)
    ? { kind: "right_pin" }
    : { kind: "wrong_pin" };
}
