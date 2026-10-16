import type { SnapshotLifecycleRules } from "../model/snapshot-lifecycle-rules.js";

export interface SnapshotLifecycleRulesChange {
  previous: SnapshotLifecycleRules;
  next: SnapshotLifecycleRules;
  actorId: string;
}

export interface SnapshotLifecycleRulesStoreTransaction {
  lockLifecycleRules(): Promise<SnapshotLifecycleRules | undefined>;
  recordLifecycleRulesChange(change: SnapshotLifecycleRulesChange): Promise<void>;
}

export interface SnapshotLifecycleRulesStore {
  transaction<TOutcome>(
    work: (tx: SnapshotLifecycleRulesStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface ChangeSnapshotLifecycleRulesPorts {
  store: SnapshotLifecycleRulesStore;
}
