import type { OffsiteDumpCheckResult } from "../model/offsite-dump-check.js";

export interface OffsiteDumpCheckStoreTransaction {
  latestVerifiedSizeBefore(night: string): Promise<number | undefined>;
  recordResult(night: string, result: OffsiteDumpCheckResult): Promise<void>;
}

export interface OffsiteDumpCheckStore {
  transaction<TOutcome>(
    work: (tx: OffsiteDumpCheckStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface OffsiteDumpCheckPorts {
  store: OffsiteDumpCheckStore;
}
