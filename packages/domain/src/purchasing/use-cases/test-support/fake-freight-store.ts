import type {
  Freight,
  FreightEdit,
  FreightPurchase,
  FreightStore,
  FreightStoreTransaction,
  FreightValues,
  LockFreightResult,
  NewFreightFields,
} from "../freight-store.js";

export type FakeFreightWrite = "insertFreight" | "replaceFreight" | "recordFreightEdit";

export interface FakeFreightState {
  freights: Freight[];
  edits: FreightEdit[];
  nextId: number;
}

export interface FakeStoredPurchase extends FreightPurchase {
  locationId: string;
}

function cloneFreight(freight: Freight): Freight {
  return {
    ...freight,
    recordedAt: new Date(freight.recordedAt),
    means: { ...freight.means },
    purchaseIds: [...freight.purchaseIds],
  };
}

function cloneValues(values: FreightValues): FreightValues {
  return { ...values, means: { ...values.means }, purchaseIds: [...values.purchaseIds] };
}

function cloneState(state: FakeFreightState): FakeFreightState {
  return {
    freights: state.freights.map(cloneFreight),
    edits: state.edits.map((edit) => ({
      ...edit,
      editedAt: new Date(edit.editedAt),
      previous: cloneValues(edit.previous),
      next: cloneValues(edit.next),
    })),
    nextId: state.nextId,
  };
}

class FakeFreightStoreTransaction implements FreightStoreTransaction {
  constructor(
    private readonly state: FakeFreightState,
    private readonly store: FakeFreightStore,
  ) {}

  async lockPurchasesForFreight(
    locationId: string,
    purchaseIds: readonly string[],
  ): Promise<FreightPurchase[]> {
    this.store.lockLog.push(`purchases:${purchaseIds.join(",")}`);
    return this.store.purchases
      .filter((purchase) => purchase.locationId === locationId && purchaseIds.includes(purchase.id))
      .map(({ id, lines }) => ({ id, lines: lines.map((line) => ({ ...line })) }));
  }

  async insertFreight(fields: NewFreightFields): Promise<{ id: string }> {
    this.store.beforeWrite("insertFreight");
    const id = `freight-${this.state.nextId++}`;
    this.state.freights.push(cloneFreight({ ...fields, id }));
    return { id };
  }

  async lockFreight(locationId: string, freightId: string): Promise<LockFreightResult> {
    this.store.lockLog.push(`freight:${freightId}`);
    const freight = this.state.freights.find(
      (row) => row.id === freightId && row.locationId === locationId,
    );
    return freight ? { kind: "locked", freight: cloneFreight(freight) } : { kind: "not_found" };
  }

  async replaceFreight(freightId: string, values: FreightValues): Promise<void> {
    this.store.beforeWrite("replaceFreight");
    for (const row of this.state.freights) {
      if (row.id === freightId) {
        Object.assign(row, cloneValues(values));
      }
    }
  }

  async recordFreightEdit(edit: FreightEdit): Promise<void> {
    this.store.beforeWrite("recordFreightEdit");
    this.state.edits.push({
      ...edit,
      previous: cloneValues(edit.previous),
      next: cloneValues(edit.next),
    });
  }
}

export class FakeFreightStore implements FreightStore {
  private state: FakeFreightState = { freights: [], edits: [], nextId: 1 };
  private readonly failing = new Set<FakeFreightWrite>();

  purchases: FakeStoredPurchase[] = [];
  lockLog: string[] = [];
  transactionCount = 0;

  seedFreight(freight: Freight): void {
    this.state.freights.push(cloneFreight(freight));
  }

  failWrite(operation: FakeFreightWrite): void {
    this.failing.add(operation);
  }

  beforeWrite(operation: FakeFreightWrite): void {
    if (this.failing.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }

  snapshot(): FakeFreightState {
    return cloneState(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: FreightStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionCount += 1;
    const before = cloneState(this.state);
    try {
      return await work(new FakeFreightStoreTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
