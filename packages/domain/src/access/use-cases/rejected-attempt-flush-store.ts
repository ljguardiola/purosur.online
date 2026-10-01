export type RejectedAttemptKind = "request" | "registration_options" | "redeem";

export interface RejectedAttemptWindow {
  kind: RejectedAttemptKind;
  keyHash: string;
  windowStart: Date;
  count: number;
  firstAt: Date;
  lastAt: Date;
}

export interface FlushedRejectedAttempts {
  accountId: string;
  kind: RejectedAttemptKind;
  count: number;
  firstAt: Date;
  lastAt: Date;
}

export interface RejectedAttemptFlushStore {
  transaction<TOutcome>(
    work: (tx: RejectedAttemptFlushStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface RejectedAttemptFlushStoreTransaction {
  // Serializes the flushes: one flush at a time, so no window is split across two audit rows.
  lockFlush(): Promise<void>;
  // Removes the windows that closed at or before `closedBefore`, oldest first, at most `limit`.
  takeClosedWindows(closedBefore: Date, limit: number): Promise<RejectedAttemptWindow[]>;
  // Maps each destination address hash to the account holding that address; unknown hashes are absent.
  accountsByDestinationHash(keyHashes: string[]): Promise<Map<string, string>>;
  // Maps each token hash to the account the token belongs to; unknown hashes are absent.
  accountsByTokenHash(keyHashes: string[]): Promise<Map<string, string>>;
  // Removes every other closed token-kind window that belongs to one of the accounts' tokens.
  takeClosedTokenWindowsOf(
    accountIds: string[],
    closedBefore: Date,
  ): Promise<RejectedAttemptWindow[]>;
  recordFlushedAttempts(flushed: FlushedRejectedAttempts[]): Promise<void>;
}
