export interface TrippedLockout {
  lockoutId: string;
  sourceAddress: string;
  failureCount: number;
  blockedUntil: Date;
}

export interface SignInLockoutLog {
  recordLockout(lockout: TrippedLockout): Promise<void>;
}
