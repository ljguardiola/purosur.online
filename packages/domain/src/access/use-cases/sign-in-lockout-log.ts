export interface TrippedLockout {
  lockoutId: string;
  sourceAddressHash: string;
  failureCount: number;
  blockedUntil: Date;
}

export interface SignInLockoutLog {
  recordLockout(lockout: TrippedLockout): Promise<void>;
}
