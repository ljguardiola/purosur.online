import type { SaleUnit } from "../../../catalog/index.js";
import type {
  Clock,
  CoveringCount,
  LockProductStockResult,
  NewStockCount,
  NewStockMovement,
  ProductStockKey,
  StockStore,
  StockStoreTransaction,
} from "../stock-store.js";

export interface FakeStockProduct {
  id: string;
  saleUnit: SaleUnit;
  active: boolean;
}

export interface FakeStockMovement extends NewStockMovement {
  id: string;
}

export interface FakeStockBalance extends ProductStockKey {
  quantity: number;
}

export interface FakeStockState {
  products: FakeStockProduct[];
  balances: FakeStockBalance[];
  movements: FakeStockMovement[];
  counts: NewStockCount[];
  nextId: number;
}

type WriteOperation = "recordMovement" | "recordCount" | "addToBalance";

function cloneState(state: FakeStockState): FakeStockState {
  return {
    products: state.products.map((row) => ({ ...row })),
    balances: state.balances.map((row) => ({ ...row })),
    movements: state.movements.map((row) => ({ ...row, occurredAt: new Date(row.occurredAt) })),
    counts: state.counts.map((row) => ({ ...row })),
    nextId: state.nextId,
  };
}

function sameKey(row: ProductStockKey, key: ProductStockKey): boolean {
  return row.productId === key.productId && row.locationId === key.locationId;
}

class FakeStockStoreTransaction implements StockStoreTransaction {
  private readonly state: FakeStockState;
  private readonly store: FakeStockStore;

  constructor(state: FakeStockState, store: FakeStockStore) {
    this.state = state;
    this.store = store;
  }

  async lockProductStock(key: ProductStockKey): Promise<LockProductStockResult> {
    this.store.operationOrder.push("lockProductStock");
    const product = this.state.products.find((row) => row.id === key.productId);
    if (!product) {
      return { kind: "not_found" };
    }
    const balance = this.state.balances.find((row) => sameKey(row, key));
    return { kind: "locked", saleUnit: product.saleUnit, balance: balance?.quantity ?? 0 };
  }

  async earliestCountAtOrAfter(key: ProductStockKey, at: Date): Promise<CoveringCount | undefined> {
    this.store.operationOrder.push("earliestCountAtOrAfter");
    const [earliest] = this.state.movements
      .filter(
        (row) =>
          sameKey(row, key) && row.kind === "count" && row.occurredAt.getTime() >= at.getTime(),
      )
      .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());
    return earliest && { movementId: earliest.id, occurredAt: new Date(earliest.occurredAt) };
  }

  async appliedDeltaAfter(key: ProductStockKey, at: Date): Promise<number> {
    this.store.operationOrder.push("appliedDeltaAfter");
    return this.state.movements
      .filter(
        (row) =>
          sameKey(row, key) &&
          row.supersededByCountId === null &&
          row.occurredAt.getTime() > at.getTime(),
      )
      .reduce((sum, row) => sum + row.delta, 0);
  }

  async recordMovement(movement: NewStockMovement): Promise<string> {
    this.beforeWrite("recordMovement");
    const id = `movement-${this.state.nextId++}`;
    this.state.movements.push({ ...movement, id });
    return id;
  }

  async recordCount(count: NewStockCount): Promise<void> {
    this.beforeWrite("recordCount");
    this.state.counts.push({ ...count });
  }

  async addToBalance(key: ProductStockKey, delta: number): Promise<number> {
    this.beforeWrite("addToBalance");
    const existing = this.state.balances.find((row) => sameKey(row, key));
    if (existing) {
      existing.quantity += delta;
      return existing.quantity;
    }
    this.state.balances.push({ ...key, quantity: delta });
    return delta;
  }

  private beforeWrite(operation: WriteOperation): void {
    this.store.operationOrder.push(operation);
    if (this.store.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }
}

export class FakeStockStore implements StockStore {
  private state: FakeStockState = {
    products: [],
    balances: [],
    movements: [],
    counts: [],
    nextId: 1,
  };

  failingWrites = new Set<WriteOperation>();
  operationOrder: string[] = [];

  seedProduct(product: FakeStockProduct): void {
    this.state.products.push({ ...product });
  }

  seedBalance(balance: FakeStockBalance): void {
    this.state.balances.push({ ...balance });
  }

  seedMovement(movement: Omit<FakeStockMovement, "id">): string {
    const id = `movement-${this.state.nextId++}`;
    this.state.movements.push({ ...movement, id });
    return id;
  }

  balanceOf(key: ProductStockKey): number {
    return this.state.balances.find((row) => sameKey(row, key))?.quantity ?? 0;
  }

  snapshot(): FakeStockState {
    return cloneState(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: StockStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = cloneState(this.state);
    try {
      return await work(new FakeStockStoreTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}

export class FixedClock implements Clock {
  private readonly moment: Date;

  constructor(moment: Date) {
    this.moment = moment;
  }

  now(): Date {
    return new Date(this.moment);
  }
}
