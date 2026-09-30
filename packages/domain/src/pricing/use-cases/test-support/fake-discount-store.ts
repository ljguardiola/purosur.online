import type { SaleUnit } from "../../../catalog/index.js";
import type { DiscountTarget, DiscountTargetKind } from "../../model/discount-target.js";
import type {
  DiscountFields,
  DiscountStore,
  DiscountStoreTransaction,
  LockAssignableTargetResult,
  LockDiscountResult,
} from "../discount-store.js";

export interface FakeTargetRow {
  kind: DiscountTargetKind;
  id: string;
  active: boolean;
  name?: string;
  saleUnit?: SaleUnit;
}

export interface FakeDiscountRow extends DiscountFields {
  id: string;
}

export interface FakeDiscountState {
  targets: FakeTargetRow[];
  discounts: FakeDiscountRow[];
  nextId: number;
}

type WriteOperation = "insertDiscount" | "updateDiscount";

function cloneRow(row: FakeDiscountRow): FakeDiscountRow {
  return {
    ...row,
    benefit: { ...row.benefit },
    target: { ...row.target },
    weekdays: [...row.weekdays],
  };
}

function cloneState(state: FakeDiscountState): FakeDiscountState {
  return {
    targets: state.targets.map((row) => ({ ...row })),
    discounts: state.discounts.map(cloneRow),
    nextId: state.nextId,
  };
}

class FakeDiscountStoreTransaction implements DiscountStoreTransaction {
  private readonly state: FakeDiscountState;
  private readonly store: FakeDiscountStore;

  constructor(state: FakeDiscountState, store: FakeDiscountStore) {
    this.state = state;
    this.store = store;
  }

  async lockAssignableTarget(target: DiscountTarget): Promise<LockAssignableTargetResult> {
    this.store.operationOrder.push("lockAssignableTarget");
    const row = this.state.targets.find(
      (candidate) => candidate.kind === target.kind && candidate.id === target.id,
    );
    if (row === undefined || (row.kind !== "CATEGORY" && !row.active)) {
      return { kind: "not_found" };
    }
    return {
      kind: "locked",
      name: row.name ?? row.id,
      saleUnit: row.kind === "PRODUCT" ? (row.saleUnit ?? "UNIT") : null,
    };
  }

  async insertDiscount(discount: DiscountFields): Promise<{ id: string }> {
    this.beforeWrite("insertDiscount");
    const id = `discount-${this.state.nextId++}`;
    this.state.discounts.push(cloneRow({ id, ...discount }));
    return { id };
  }

  async lockDiscount(id: string): Promise<LockDiscountResult> {
    this.store.operationOrder.push("lockDiscount");
    const row = this.state.discounts.find((candidate) => candidate.id === id);
    if (!row) {
      return { kind: "not_found" };
    }
    const { id: _id, ...discount } = cloneRow(row);
    return { kind: "locked", discount };
  }

  async updateDiscount(id: string, discount: DiscountFields): Promise<void> {
    this.beforeWrite("updateDiscount");
    const index = this.state.discounts.findIndex((candidate) => candidate.id === id);
    this.state.discounts[index] = cloneRow({ id, ...discount });
  }

  private beforeWrite(operation: WriteOperation): void {
    this.store.operationOrder.push(operation);
    if (this.store.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }
}

export class FakeDiscountStore implements DiscountStore {
  private state: FakeDiscountState = { targets: [], discounts: [], nextId: 1 };

  failingWrites = new Set<WriteOperation>();
  operationOrder: string[] = [];
  transactionCount = 0;

  seedTarget(target: FakeTargetRow): void {
    this.state.targets.push({ ...target });
  }

  seedDiscount(discount: FakeDiscountRow): void {
    this.state.discounts.push(cloneRow(discount));
  }

  snapshot(): FakeDiscountState {
    return cloneState(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: DiscountStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionCount += 1;
    const before = cloneState(this.state);
    try {
      return await work(new FakeDiscountStoreTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
