import type { PinCodeParty } from "../model/pin-code.js";

export interface Clock {
  now(): Date;
}

export interface GeneratedPinCode {
  code: string;
  codeHash: string;
}

export interface PinCodeGenerator {
  generate(): GeneratedPinCode;
}

export interface PinCodeTarget extends Pick<PinCodeParty, "isAdministrator"> {
  active: boolean;
}

export interface NewPinCode {
  userId: string;
  codeHash: string;
  issuedBy: string;
  issuedAt: Date;
  expiresAt: Date;
}

export interface PinCodeEmission {
  actorId: string;
  userId: string;
  expiresAt: Date;
}

export interface PinCodeStore {
  transaction<TOutcome>(
    work: (tx: PinCodeStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface PinCodeStoreTransaction {
  lockPinCodeTarget(userId: string): Promise<PinCodeTarget | undefined>;
  pinCodesIssuedSince(userId: string, since: Date): Promise<Date[]>;
  supersedeLivePinCodes(userId: string, supersededAt: Date): Promise<void>;
  removePin(userId: string): Promise<void>;
  recordPinCode(pinCode: NewPinCode): Promise<void>;
  recordPinCodeEmission(emission: PinCodeEmission): Promise<void>;
}

export interface PinCodeEmissionPorts {
  store: PinCodeStore;
  clock: Clock;
  codes: PinCodeGenerator;
}
