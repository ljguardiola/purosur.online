import type { PinCodeState } from "../model/pin-code.js";
import type { Clock } from "./pin-code-store.js";

export interface HashedPin {
  salt: string;
  pinHash: string;
}

export interface PinHasher {
  hash(pin: string): Promise<HashedPin>;
}

export type PinCodeRedemptionAttemptKey =
  | { kind: "register"; value: string }
  | { kind: "source_address"; value: string };

export interface PinCodeHolder {
  active: boolean;
}

export interface LockedPinCode extends PinCodeState {
  expiresAt: Date;
}

export interface PinCodeRedemption {
  userId: string;
  registerId: string;
  redeemedAt: Date;
}

export interface PinCodeRedemptionStore {
  transaction<TOutcome>(
    work: (tx: PinCodeRedemptionStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface PinCodeRedemptionStoreTransaction {
  findPinCodeHolder(codeHash: string): Promise<string | undefined>;
  lockPinCodeHolder(userId: string): Promise<PinCodeHolder | undefined>;
  lockHeldPinCode(userId: string, codeHash: string): Promise<LockedPinCode | undefined>;
  lockPinCodeRedemptionAttempts(keys: readonly PinCodeRedemptionAttemptKey[]): Promise<void>;
  acceptedPinCodeRedemptionAttempts(key: PinCodeRedemptionAttemptKey, since: Date): Promise<Date[]>;
  recordPinCodeRedemptionAttempt(
    keys: readonly PinCodeRedemptionAttemptKey[],
    attemptedAt: Date,
  ): Promise<void>;
  recordFailedPinCodeRedemption(codeHash: string): Promise<void>;
  replacePin(userId: string, pin: HashedPin, changedAt: Date): Promise<void>;
  markPinCodeRedeemed(codeHash: string, redeemedAt: Date): Promise<void>;
  recordPinCodeRedemption(redemption: PinCodeRedemption): Promise<void>;
}

export interface PinCodeRedemptionPorts {
  store: PinCodeRedemptionStore;
  clock: Clock;
  hasher: PinHasher;
}
