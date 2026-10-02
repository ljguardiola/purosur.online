import type { SignInLockoutLog, TrippedLockout } from "./sign-in-lockout-log.js";

export interface RecordSignInLockoutPorts {
  log: SignInLockoutLog;
}

export function recordSignInLockout(
  { log }: RecordSignInLockoutPorts,
  lockout: TrippedLockout,
): Promise<void> {
  return log.recordLockout(lockout);
}
