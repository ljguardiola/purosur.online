export const ENROLLMENT_CODE_LENGTH = 16;
export const ENROLLMENT_CODE_VALIDITY_MS = 15 * 60 * 1000;
export const ENROLLMENT_CODE_MAX_FAILED_ATTEMPTS = 5;

const ENROLLMENT_CODE_LOOKUP_LENGTH = 4;
const WELL_FORMED_ENROLLMENT_CODE = new RegExp(`^[A-Z2-7]{${ENROLLMENT_CODE_LENGTH}}$`);

export interface EnrollmentCodeState {
  expiresAt: Date;
  redeemedAt: Date | null;
  failedAttempts: number;
}

export function enrollmentCodeExpiresAt(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + ENROLLMENT_CODE_VALIDITY_MS);
}

export function normalizeEnrollmentCode(typed: string): string {
  return typed.replace(/\s/g, "").toUpperCase();
}

export function isWellFormedEnrollmentCode(code: string): boolean {
  return WELL_FORMED_ENROLLMENT_CODE.test(code);
}

// The first group is kept in plain text beside the code's hash, so an attempt with a mistyped
// remainder still reaches the code it was aimed at and counts against it.
export function enrollmentCodeLookup(code: string): string {
  return code.slice(0, ENROLLMENT_CODE_LOOKUP_LENGTH);
}

export function isEnrollmentCodeUsable(code: EnrollmentCodeState, now: Date): boolean {
  return (
    code.redeemedAt === null &&
    now < code.expiresAt &&
    code.failedAttempts < ENROLLMENT_CODE_MAX_FAILED_ATTEMPTS
  );
}
