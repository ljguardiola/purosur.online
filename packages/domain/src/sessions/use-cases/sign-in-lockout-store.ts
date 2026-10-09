export interface SourceAddressBlock {
  sourceAddress: string;
  blockedUntil: Date;
  failuresSince: Date;
}

export interface SignInLockoutAlert {
  sourceAddress: string;
  failureCount: number;
  blockedUntil: Date;
  openedAt: Date;
}

export interface SignInLockoutStore {
  transaction<TOutcome>(
    work: (tx: SignInLockoutStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface SignInLockoutStoreTransaction {
  // Holds until the transaction ends, so the attempts of one source address are decided one at a time.
  lockSourceAddress(sourceAddress: string): Promise<void>;
  pruneFailuresOutsideWindow(windowStart: Date): Promise<void>;
  // The end of the address's recorded block, whether or not it is still live.
  findBlockedUntil(sourceAddress: string): Promise<Date | undefined>;
  countFailuresInWindow(sourceAddress: string, windowStart: Date): Promise<number>;
  recordFailure(sourceAddress: string, at: Date): Promise<string>;
  // Sets or moves the address's block and clears the failures that led to it, those after failuresSince.
  blockSourceAddress(block: SourceAddressBlock): Promise<{ id: string }>;
  openLockoutAlert(alert: SignInLockoutAlert): Promise<void>;
}
