import type { SnapshotLifecycleRules } from "../../model/snapshot-lifecycle-rules.js";
import type {
  SnapshotLifecycleRulesChange,
  SnapshotLifecycleRulesStore,
  SnapshotLifecycleRulesStoreTransaction,
} from "../snapshot-lifecycle-rules-ports.js";

export interface FakeSnapshotLifecycleRulesState {
  rules: SnapshotLifecycleRules | undefined;
  changes: SnapshotLifecycleRulesChange[];
}

class FakeSnapshotLifecycleRulesTransaction implements SnapshotLifecycleRulesStoreTransaction {
  private readonly state: FakeSnapshotLifecycleRulesState;
  private readonly store: FakeSnapshotLifecycleRulesStore;

  constructor(state: FakeSnapshotLifecycleRulesState, store: FakeSnapshotLifecycleRulesStore) {
    this.state = state;
    this.store = store;
  }

  async lockLifecycleRules(): Promise<SnapshotLifecycleRules | undefined> {
    this.store.operationOrder.push("lockLifecycleRules");
    return this.state.rules ? { ...this.state.rules } : undefined;
  }

  async recordLifecycleRulesChange(change: SnapshotLifecycleRulesChange): Promise<void> {
    this.store.operationOrder.push("recordLifecycleRulesChange");
    this.state.rules = { ...change.next };
    if (this.store.failingAudit) {
      throw new Error("recordLifecycleRulesChange failed");
    }
    this.state.changes.push(structuredClone(change));
  }
}

export class FakeSnapshotLifecycleRulesStore implements SnapshotLifecycleRulesStore {
  private state: FakeSnapshotLifecycleRulesState = { rules: undefined, changes: [] };
  failingAudit = false;
  operationOrder: string[] = [];

  seedRules(rules: SnapshotLifecycleRules): void {
    this.state.rules = { ...rules };
  }

  snapshot(): FakeSnapshotLifecycleRulesState {
    return structuredClone(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: SnapshotLifecycleRulesStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = structuredClone(this.state);
    try {
      return await work(new FakeSnapshotLifecycleRulesTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
