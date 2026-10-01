import { isEnrollmentCodeUsable } from "../model/enrollment-code.js";
import type { BranchRegisters, RegisterEnrollmentCode } from "./branch-register-store.js";
import type { Clock } from "./register-store.js";

export interface ListBranchRegistersPorts {
  registers: BranchRegisters;
  clock: Clock;
}

export interface ListBranchRegistersInput {
  locationId: string;
}

export interface PendingEnrollmentCode {
  secondsSinceIssued: number;
  secondsUntilExpiry: number;
}

export interface BranchRegisterSummary {
  id: string;
  name: string;
  pendingCode: PendingEnrollmentCode | null;
  pointOfSaleNumber: number | null;
}

function pendingCodeOf(
  code: RegisterEnrollmentCode | null,
  now: Date,
): PendingEnrollmentCode | null {
  if (code === null || !isEnrollmentCodeUsable(code, now)) {
    return null;
  }
  return {
    secondsSinceIssued: Math.max(0, Math.floor((now.getTime() - code.issuedAt.getTime()) / 1000)),
    secondsUntilExpiry: Math.ceil((code.expiresAt.getTime() - now.getTime()) / 1000),
  };
}

export async function listBranchRegisters(
  { registers, clock }: ListBranchRegistersPorts,
  input: ListBranchRegistersInput,
): Promise<BranchRegisterSummary[]> {
  const branchRegisters = await registers.branchRegisters(input.locationId);
  const now = clock.now();
  return branchRegisters.map((register) => ({
    id: register.id,
    name: register.name,
    pendingCode: pendingCodeOf(register.enrollmentCode, now),
    pointOfSaleNumber: register.pointOfSaleNumber,
  }));
}
