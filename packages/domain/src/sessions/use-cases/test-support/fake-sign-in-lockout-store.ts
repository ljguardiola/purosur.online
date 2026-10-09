import type {
  SignInLockoutAlert,
  SignInLockoutStore,
  SignInLockoutStoreTransaction,
  SourceAddressBlock,
} from "../sign-in-lockout-store.js";

interface FakeSignInFailure {
  id: string;
  sourceAddress: string;
  attemptedAt: Date;
}

export interface FakeSignInLockoutRecord {
  id: string;
  sourceAddress: string;
  blockedUntil: Date;
}

export interface FakeSignInLockoutState {
  failures: FakeSignInFailure[];
  lockouts: FakeSignInLockoutRecord[];
  alerts: SignInLockoutAlert[];
}

class FakeSignInLockoutStoreTransaction implements SignInLockoutStoreTransaction {
  private readonly store: FakeSignInLockoutStore;

  constructor(store: FakeSignInLockoutStore) {
    this.store = store;
  }

  private get state(): FakeSignInLockoutState {
    return this.store.current;
  }

  async lockSourceAddress(sourceAddress: string): Promise<void> {
    this.store.record("lockSourceAddress");
    this.store.lockedAddresses.push(sourceAddress);
  }

  async findBlockedUntil(sourceAddress: string): Promise<Date | undefined> {
    this.store.record("findBlockedUntil");
    return this.state.lockouts.find((held) => held.sourceAddress === sourceAddress)?.blockedUntil;
  }

  async countFailuresInWindow(sourceAddress: string, windowStart: Date): Promise<number> {
    this.store.record("countFailuresInWindow");
    return this.state.failures.filter(
      (held) => held.sourceAddress === sourceAddress && held.attemptedAt > windowStart,
    ).length;
  }

  async recordFailure(sourceAddress: string, at: Date): Promise<string> {
    this.store.record("recordFailure");
    const id = `failure-${this.store.nextId()}`;
    this.state.failures.push({ id, sourceAddress, attemptedAt: at });
    return id;
  }

  async blockSourceAddress(block: SourceAddressBlock): Promise<{ id: string }> {
    this.store.record("blockSourceAddress");
    const existing = this.state.lockouts.find((held) => held.sourceAddress === block.sourceAddress);
    const id = existing?.id ?? `lockout-${this.store.nextId()}`;
    if (existing) {
      existing.blockedUntil = block.blockedUntil;
    } else {
      this.state.lockouts.push({ id, ...block });
    }
    this.state.failures = this.state.failures.filter(
      (held) => held.sourceAddress !== block.sourceAddress,
    );
    return { id };
  }

  async openLockoutAlert(alert: SignInLockoutAlert): Promise<void> {
    this.store.record("openLockoutAlert");
    this.state.alerts.push(structuredClone(alert));
  }
}

export class FakeSignInLockoutStore implements SignInLockoutStore {
  private state: FakeSignInLockoutState = { failures: [], lockouts: [], alerts: [] };
  private idCounter = 0;

  failingWrites = new Set<string>();
  operationOrder: string[] = [];
  lockedAddresses: string[] = [];
  transactions = 0;

  get current(): FakeSignInLockoutState {
    return this.state;
  }

  nextId(): number {
    this.idCounter += 1;
    return this.idCounter;
  }

  seedFailures(sourceAddress: string, attemptedAt: Date, count: number): void {
    for (let index = 0; index < count; index += 1) {
      this.state.failures.push({
        id: `failure-${this.nextId()}`,
        sourceAddress,
        attemptedAt,
      });
    }
  }

  seedLockout(lockout: FakeSignInLockoutRecord): void {
    this.state.lockouts.push(structuredClone(lockout));
  }

  snapshot(): FakeSignInLockoutState {
    return structuredClone(this.state);
  }

  record(operation: string): void {
    this.operationOrder.push(operation);
    if (this.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }

  async pruneFailuresOutsideWindow(windowStart: Date): Promise<void> {
    this.record("pruneFailuresOutsideWindow");
    this.state.failures = this.state.failures.filter((held) => held.attemptedAt > windowStart);
  }

  async transaction<TOutcome>(
    work: (tx: SignInLockoutStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactions += 1;
    const before = structuredClone(this.state);
    try {
      return await work(new FakeSignInLockoutStoreTransaction(this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
