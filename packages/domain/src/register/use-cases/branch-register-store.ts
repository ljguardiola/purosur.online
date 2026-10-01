import type { EnrollmentCodeState } from "../model/enrollment-code.js";

export type { EnrollmentCodeState };

export interface RegisterEnrollmentCode extends EnrollmentCodeState {
  issuedAt: Date;
}

export interface BranchRegister {
  id: string;
  name: string;
  enrollmentCode: RegisterEnrollmentCode | null;
}

export interface BranchRegisters {
  branchRegisters(locationId: string): Promise<BranchRegister[]>;
  hasRegister(locationId: string, registerId: string): Promise<boolean>;
}

export interface IssuedEnrollmentCode {
  code: string;
  codeHash: string;
}

export interface EnrollmentCodeIssuer {
  issue(): IssuedEnrollmentCode;
}

// Thrown by a write that races a register name's per-branch uniqueness.
export class RegisterNameConflict extends Error {}

export interface NewRegister {
  locationId: string;
  name: string;
}

export interface RegisterCreation {
  registerId: string;
  locationId: string;
  name: string;
  actorId: string;
}

export type LockRegisterResult = { kind: "not_found" } | { kind: "locked" };

export interface NewEnrollmentCode {
  registerId: string;
  lookup: string;
  codeHash: string;
  issuedAt: Date;
  expiresAt: Date;
}

export interface EnrollmentCodeEmission {
  registerId: string;
  actorId: string;
  replacedCodeExpiresAt: Date | null;
  expiresAt: Date;
}

export interface BranchRegisterStore {
  transaction<TOutcome>(
    work: (tx: BranchRegisterStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface BranchRegisterStoreTransaction {
  // Letter case is ignored.
  registerNameTaken(locationId: string, name: string): Promise<boolean>;
  recordRegister(register: NewRegister): Promise<{ id: string }>;
  recordRegisterCreation(creation: RegisterCreation): Promise<void>;
  lockBranchRegister(locationId: string, registerId: string): Promise<LockRegisterResult>;
  lockEnrollmentCode(registerId: string): Promise<EnrollmentCodeState | undefined>;
  recordEnrollmentCode(code: NewEnrollmentCode): Promise<void>;
  recordEnrollmentCodeEmission(emission: EnrollmentCodeEmission): Promise<void>;
}
