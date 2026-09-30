import type { Clock, PinCodeGenerator, PinCodeStoreTransaction } from "./pin-code-store.js";

export interface FirstPinCodeTarget {
  active: boolean;
  hasPin: boolean;
  email: string;
}

export interface FirstPinCodeEmission {
  registerId: string;
  userId: string;
  expiresAt: Date;
}

export interface FirstPinCodeStore {
  transaction<TOutcome>(
    work: (tx: FirstPinCodeStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface FirstPinCodeStoreTransaction
  extends Pick<
    PinCodeStoreTransaction,
    "pinCodesIssuedSince" | "supersedeLivePinCodes" | "recordPinCode"
  > {
  lockFirstPinCodeTarget(
    registerId: string,
    userId: string,
  ): Promise<FirstPinCodeTarget | undefined>;
  recordFirstPinCodeEmission(emission: FirstPinCodeEmission): Promise<void>;
}

export interface FirstPinCodeMailer {
  sendFirstPinCode(email: string, code: string): Promise<void>;
}

// Thrown by a mailer whose email did not go out, so the emission leaves nothing behind.
export class FirstPinCodeEmailUnavailable extends Error {}

export interface FirstPinCodeEmissionPorts {
  store: FirstPinCodeStore;
  clock: Clock;
  codes: PinCodeGenerator;
  mailer: FirstPinCodeMailer;
}
