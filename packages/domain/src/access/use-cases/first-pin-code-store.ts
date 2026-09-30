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

export interface QueuedFirstPinCodeEmail {
  email: string;
  code: string;
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
  queueFirstPinCodeEmail(email: QueuedFirstPinCodeEmail): Promise<void>;
}

export interface FirstPinCodeEmissionPorts {
  store: FirstPinCodeStore;
  clock: Clock;
  codes: PinCodeGenerator;
}
