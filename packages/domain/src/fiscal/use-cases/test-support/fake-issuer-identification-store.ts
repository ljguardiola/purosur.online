import type {
  IssuerIdentification,
  IssuerIdentificationStore,
  IssuerIdentificationStoreTransaction,
  NewIssuerIdentificationVersion,
} from "../issuer-identification-store.js";

export interface FakeIssuerIdentificationState {
  current: IssuerIdentification;
  versions: (NewIssuerIdentificationVersion & { previous: IssuerIdentification })[];
}

function cloneState(state: FakeIssuerIdentificationState): FakeIssuerIdentificationState {
  return {
    current: { ...state.current },
    versions: state.versions.map((version) => ({
      ...version,
      previous: { ...version.previous },
    })),
  };
}

class FakeTransaction implements IssuerIdentificationStoreTransaction {
  private readonly state: FakeIssuerIdentificationState;
  private readonly store: FakeIssuerIdentificationStore;

  constructor(state: FakeIssuerIdentificationState, store: FakeIssuerIdentificationStore) {
    this.state = state;
    this.store = store;
  }

  async lockCurrentIssuerIdentification(): Promise<IssuerIdentification> {
    this.store.operationOrder.push("lockCurrentIssuerIdentification");
    return { ...this.state.current };
  }

  async recordIssuerIdentificationVersion(
    next: NewIssuerIdentificationVersion,
    previous: IssuerIdentification,
  ): Promise<void> {
    this.store.operationOrder.push("recordIssuerIdentificationVersion");
    const { recordedBy: _recordedBy, ...current } = next;
    this.state.current = current;
    this.state.versions.push({ ...next, previous: { ...previous } });
  }
}

export class FakeIssuerIdentificationStore implements IssuerIdentificationStore {
  private state: FakeIssuerIdentificationState;

  operationOrder: string[] = [];
  transactionCount = 0;

  constructor(current: IssuerIdentification) {
    this.state = { current: { ...current }, versions: [] };
  }

  snapshot(): FakeIssuerIdentificationState {
    return cloneState(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: IssuerIdentificationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionCount += 1;
    const before = cloneState(this.state);
    try {
      return await work(new FakeTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
