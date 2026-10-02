import type {
  FlushedRejectedAttempts,
  RejectedAttemptFlushStore,
  RejectedAttemptFlushStoreTransaction,
  RejectedAttemptWindow,
} from "../rejected-attempt-flush-store.js";

export interface FakeRejectedAttemptFlushState {
  windows: RejectedAttemptWindow[];
  flushed: FlushedRejectedAttempts[];
}

function lookUp(directory: Map<string, string>, keyHashes: string[]): Map<string, string> {
  const found = new Map<string, string>();
  for (const keyHash of keyHashes) {
    const accountId = directory.get(keyHash);
    if (accountId) {
      found.set(keyHash, accountId);
    }
  }
  return found;
}

class FakeRejectedAttemptFlushStoreTransaction implements RejectedAttemptFlushStoreTransaction {
  private readonly store: FakeRejectedAttemptFlushStore;

  constructor(store: FakeRejectedAttemptFlushStore) {
    this.store = store;
  }

  private get state(): FakeRejectedAttemptFlushState {
    return this.store.current;
  }

  async lockFlush(): Promise<void> {
    this.store.operationOrder.push("lockFlush");
  }

  async takeClosedWindows(closedBefore: Date, limit: number): Promise<RejectedAttemptWindow[]> {
    this.store.operationOrder.push("takeClosedWindows");
    const taken = this.state.windows
      .filter((window) => window.windowStart <= closedBefore)
      .sort((a, b) => a.windowStart.getTime() - b.windowStart.getTime())
      .slice(0, limit);
    this.state.windows = this.state.windows.filter((window) => !taken.includes(window));
    return taken;
  }

  async accountsByDestinationHash(keyHashes: string[]): Promise<Map<string, string>> {
    this.store.operationOrder.push("accountsByDestinationHash");
    this.store.destinationLookups.push([...keyHashes]);
    return lookUp(this.store.accountsByDestination, keyHashes);
  }

  async accountsByTokenHash(keyHashes: string[]): Promise<Map<string, string>> {
    this.store.operationOrder.push("accountsByTokenHash");
    this.store.tokenLookups.push([...keyHashes]);
    return lookUp(this.store.accountsByToken, keyHashes);
  }

  async takeClosedTokenWindowsOf(
    accountIds: string[],
    closedBefore: Date,
  ): Promise<RejectedAttemptWindow[]> {
    this.store.operationOrder.push("takeClosedTokenWindowsOf");
    const taken = this.state.windows.filter((window) => {
      const accountId = this.store.accountsByToken.get(window.keyHash);
      return (
        window.kind !== "request" &&
        window.windowStart <= closedBefore &&
        accountId !== undefined &&
        accountIds.includes(accountId)
      );
    });
    this.state.windows = this.state.windows.filter((window) => !taken.includes(window));
    return taken;
  }

  async recordFlushedAttempts(flushed: FlushedRejectedAttempts[]): Promise<void> {
    this.store.operationOrder.push("recordFlushedAttempts");
    this.state.flushed.push(...structuredClone(flushed));
  }
}

export class FakeRejectedAttemptFlushStore implements RejectedAttemptFlushStore {
  private state: FakeRejectedAttemptFlushState = { windows: [], flushed: [] };

  readonly accountsByDestination = new Map<string, string>();
  readonly accountsByToken = new Map<string, string>();
  operationOrder: string[] = [];
  destinationLookups: string[][] = [];
  tokenLookups: string[][] = [];
  transactionCount = 0;

  get current(): FakeRejectedAttemptFlushState {
    return this.state;
  }

  seedWindow(window: RejectedAttemptWindow): void {
    this.state.windows.push(structuredClone(window));
  }

  snapshot(): FakeRejectedAttemptFlushState {
    return structuredClone(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: RejectedAttemptFlushStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionCount += 1;
    const before = structuredClone(this.state);
    try {
      return await work(new FakeRejectedAttemptFlushStoreTransaction(this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
