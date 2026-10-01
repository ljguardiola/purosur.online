import type {
  FiscalAddress,
  FiscalAddressChange,
  FiscalAddressStore,
  FiscalAddressStoreTransaction,
  NewFiscalAddress,
} from "../fiscal-address-store.js";
import { FiscalAddressNameConflict } from "../fiscal-address-store.js";

export interface FakeFiscalAddressRow extends FiscalAddress {
  recordedBy: string | null;
}

export interface FakeFiscalAddressState {
  fiscalAddresses: FakeFiscalAddressRow[];
  nextId: number;
}

function cloneState(state: FakeFiscalAddressState): FakeFiscalAddressState {
  return {
    fiscalAddresses: state.fiscalAddresses.map((row) => ({ ...row })),
    nextId: state.nextId,
  };
}

function withoutRecorder({ recordedBy: _recordedBy, ...fiscalAddress }: FakeFiscalAddressRow) {
  return fiscalAddress;
}

class FakeTransaction implements FiscalAddressStoreTransaction {
  private readonly state: FakeFiscalAddressState;
  private readonly store: FakeFiscalAddressStore;

  constructor(state: FakeFiscalAddressState, store: FakeFiscalAddressStore) {
    this.state = state;
    this.store = store;
  }

  async listFiscalAddresses(): Promise<FiscalAddress[]> {
    this.store.operationOrder.push("listFiscalAddresses");
    return this.state.fiscalAddresses.map(withoutRecorder);
  }

  async lockFiscalAddress(fiscalAddressId: string): Promise<FiscalAddress | undefined> {
    this.store.operationOrder.push("lockFiscalAddress");
    const row = this.state.fiscalAddresses.find((candidate) => candidate.id === fiscalAddressId);
    return row && withoutRecorder(row);
  }

  async insertFiscalAddress(fiscalAddress: NewFiscalAddress): Promise<{ id: string }> {
    this.store.operationOrder.push("insertFiscalAddress");
    this.store.refuseLostNameRace(fiscalAddress.name);
    const id = `fiscal-address-${this.state.nextId++}`;
    this.state.fiscalAddresses.push({
      id,
      name: fiscalAddress.name,
      streetAddress: fiscalAddress.streetAddress,
      version: 1,
      recordedBy: fiscalAddress.actorId,
    });
    return { id };
  }

  async updateFiscalAddress(change: FiscalAddressChange): Promise<void> {
    this.store.operationOrder.push("updateFiscalAddress");
    this.store.refuseLostNameRace(change.name);
    this.state.fiscalAddresses = this.state.fiscalAddresses.map((row) =>
      row.id === change.id
        ? {
            id: change.id,
            name: change.name,
            streetAddress: change.streetAddress,
            version: change.version,
            recordedBy: change.actorId,
          }
        : row,
    );
  }
}

export class FakeFiscalAddressStore implements FiscalAddressStore {
  private state: FakeFiscalAddressState = { fiscalAddresses: [], nextId: 1 };

  readonly nameConflicts = new Set<string>();
  operationOrder: string[] = [];
  transactionCount = 0;

  seed(fiscalAddress: FiscalAddress): void {
    this.state.fiscalAddresses.push({ ...fiscalAddress, recordedBy: null });
  }

  refuseLostNameRace(name: string): void {
    if (this.nameConflicts.has(name.toLowerCase())) {
      throw new FiscalAddressNameConflict();
    }
  }

  snapshot(): FakeFiscalAddressState {
    return cloneState(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: FiscalAddressStoreTransaction) => Promise<TOutcome>,
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
