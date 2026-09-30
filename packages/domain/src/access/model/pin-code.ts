const PIN_CODE_LENGTH = 16;
export const PIN_CODE_VALIDITY_MS = 15 * 60 * 1000;
export const PIN_CODE_MAX_FAILED_ATTEMPTS = 5;
export const PIN_CODE_HOURLY_LIMIT = 5;
export const PIN_CODE_WINDOW_MS = 60 * 60 * 1000;

const WELL_FORMED_PIN_CODE = new RegExp(`^[A-Z2-7]{${PIN_CODE_LENGTH}}$`);

export interface PinCodeParty {
  id: string;
  isAdministrator: boolean;
}

export interface PinCodeState {
  redeemedAt: Date | null;
  supersededAt: Date | null;
  failedAttempts: number;
}

export function normalizePinCode(typed: string): string {
  return typed.replace(/[\s-]/g, "").toUpperCase();
}

export function isWellFormedPinCode(code: string): boolean {
  return WELL_FORMED_PIN_CODE.test(code);
}

export function pinCodeExpiresAt(issuedAt: Date): Date {
  return new Date(issuedAt.getTime() + PIN_CODE_VALIDITY_MS);
}

export function pinCodeWindowStart(now: Date): Date {
  return new Date(now.getTime() - PIN_CODE_WINDOW_MS);
}

export function pinCodeRetryAfterSeconds(
  issuedAts: readonly Date[],
  now: Date,
): number | undefined {
  const windowStart = pinCodeWindowStart(now);
  const oldestCounted = issuedAts
    .filter((issuedAt) => issuedAt > windowStart)
    .sort((a, b) => b.getTime() - a.getTime())[PIN_CODE_HOURLY_LIMIT - 1];
  if (oldestCounted === undefined) {
    return undefined;
  }
  return Math.ceil((oldestCounted.getTime() + PIN_CODE_WINDOW_MS - now.getTime()) / 1000);
}

export function mayEmitPinCodeFor(actor: PinCodeParty, target: PinCodeParty): boolean {
  return actor.isAdministrator || (!target.isAdministrator && actor.id !== target.id);
}

export function isPinCodeBurned(code: PinCodeState): boolean {
  return (
    code.redeemedAt !== null ||
    code.supersededAt !== null ||
    code.failedAttempts >= PIN_CODE_MAX_FAILED_ATTEMPTS
  );
}

export function isPinCodeExpired(expiresAt: Date, now: Date): boolean {
  return now >= expiresAt;
}

export function isPinCodeLive(code: PinCodeState & { expiresAt: Date }, now: Date): boolean {
  return !isPinCodeBurned(code) && !isPinCodeExpired(code.expiresAt, now);
}
