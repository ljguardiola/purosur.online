import type { SignInLockoutLog, TrippedLockout } from "./sign-in-lockout-log.js";

export interface RecordSignInLockoutPorts {
  log: SignInLockoutLog;
}

export type RecordSignInLockoutOutcome = { kind: "recorded" };

export async function recordSignInLockout(
  { log }: RecordSignInLockoutPorts,
  lockout: TrippedLockout,
): Promise<RecordSignInLockoutOutcome> {
  await log.recordLockout(lockout);
  return { kind: "recorded" };
}
