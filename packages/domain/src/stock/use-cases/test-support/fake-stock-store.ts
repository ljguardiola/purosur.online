import type { SaleUnit } from "../../../catalog/index.js";
import type { Clock } from "../../../shared/index.js";
import type { NewBatchLot, NewInitialCountLot, NewLot } from "../../model/lot.js";
import type { StockLot } from "../../model/lot-allocation.js";
import { isLotCostIncomplete, type LotCost } from "../../model/lot-value.js";
import type {
  AssemblyBatchStore,
  AssemblyBatchTransaction,
  BatchLotCost,
  NewAssemblyBatch,
} from "../assembly-batch-store.js";
import type { Recipe } from "../recipe-store.js";
import type {
  CountedLot,
  CoveringCount,
  LockProductStockResult,
  LotAllocation,
  NewStockCount,
  NewStockMovement,
  OpeningCountLot,
  ProductStockKey,
  StockStore,
} from "../stock-store.js";

export interface FakeStockProduct {
  id: string;
  saleUnit: SaleUnit;
  active?: boolean;
}

interface FakeAssemblyBatch extends NewAssemblyBatch {
  id: string;
}

export interface FakeStockMovement extends NewStockMovement {
  id: string;
}

export interface FakeStockBalance extends ProductStockKey {
  quantity: number;
}

export interface FakeStockLot extends ProductStockKey, StockLot {
  purchaseLineId: string | null;
  quantityReceived: number;
  costTotalCents: number | null;
  costQuantity: number | null;
  lotNumber: string | null;
  costComplete: boolean;
  originMovementId: string | null;
  assemblyBatchId: string | null;
  withdrawn: boolean;
}

interface FakeCountedLots {
  movementId: string;
  lots: CountedLot[];
}

export interface FakeStockState {
  products: FakeStockProduct[];
  balances: FakeStockBalance[];
  movements: FakeStockMovement[];
  counts: NewStockCount[];
  countedLots: FakeCountedLots[];
  lots: FakeStockLot[];
  allocations: LotAllocation[];
  batches: FakeAssemblyBatch[];
  recipes: Recipe[];
  nextId: number;
}

type WriteOperation =
  | "recordMovement"
  | "recordCount"
  | "recordCountedLots"
  | "addToBalance"
  | "recordLot"
  | "recordInitialCountLot"
  | "markOpeningCountWithdrawn"
  | "openTechnicalLot"
  | "allocateToLot"
  | "insertAssemblyBatch"
  | "recordBatchLot";

function cloneState(state: FakeStockState): FakeStockState {
  return {
    products: state.products.map((row) => ({ ...row })),
    balances: state.balances.map((row) => ({ ...row })),
    movements: state.movements.map((row) => ({ ...row, occurredAt: new Date(row.occurredAt) })),
    counts: state.counts.map((row) => ({ ...row })),
    countedLots: state.countedLots.map((row) => ({
      movementId: row.movementId,
      lots: row.lots.map((lot) => ({ ...lot })),
    })),
    lots: state.lots.map((row) => ({ ...row, receivedAt: new Date(row.receivedAt) })),
    allocations: state.allocations.map((row) => ({ ...row })),
    batches: state.batches.map((row) => ({
      ...row,
      assembledAt: new Date(row.assembledAt),
      lines: row.lines.map((line) => ({ ...line })),
    })),
    recipes: state.recipes.map((row) => ({
      ...row,
      components: row.components.map((component) => ({ ...component })),
    })),
    nextId: state.nextId,
  };
}

function sameKey(row: ProductStockKey, key: ProductStockKey): boolean {
  return row.productId === key.productId && row.locationId === key.locationId;
}

class FakeStockStoreTransaction implements AssemblyBatchTransaction {
  private readonly state: FakeStockState;
  private readonly store: FakeStockStore;

  constructor(state: FakeStockState, store: FakeStockStore) {
    this.state = state;
    this.store = store;
  }

  async lockProductStock(key: ProductStockKey): Promise<LockProductStockResult> {
    this.store.operationOrder.push("lockProductStock");
    this.store.lockedProducts.push(key.productId);
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

  async lotAllocationsAfter(key: ProductStockKey, at: Date): Promise<Map<string, number>> {
    this.store.operationOrder.push("lotAllocationsAfter");
    const allocated = new Map<string, number>();
    for (const allocation of this.state.allocations) {
      const movement = this.state.movements.find((row) => row.id === allocation.movementId);
      if (
        movement &&
        sameKey(movement, key) &&
        movement.supersededByCountId === null &&
        movement.occurredAt.getTime() > at.getTime()
      ) {
        allocated.set(
          allocation.lotId,
          (allocated.get(allocation.lotId) ?? 0) + allocation.quantity,
        );
      }
    }
    return allocated;
  }

  async recordMovement(movement: NewStockMovement): Promise<string> {
    this.beforeWrite("recordMovement");
    const id = movement.id ?? `movement-${this.state.nextId++}`;
    this.state.movements.push({ ...movement, id });
    return id;
  }

  async recordCount(count: NewStockCount): Promise<void> {
    this.beforeWrite("recordCount");
    this.state.counts.push({ ...count });
  }

  async recordCountedLots(movementId: string, lots: readonly CountedLot[]): Promise<void> {
    this.beforeWrite("recordCountedLots");
    this.state.countedLots.push({ movementId, lots: lots.map((lot) => ({ ...lot })) });
  }

  async lotProduct(lotId: string, locationId: string): Promise<string | undefined> {
    this.store.operationOrder.push("lotProduct");
    return this.state.lots.find((row) => row.id === lotId && row.locationId === locationId)
      ?.productId;
  }

  async productLots(key: ProductStockKey): Promise<StockLot[]> {
    this.store.operationOrder.push("productLots");
    return this.state.lots
      .filter((row) => sameKey(row, key))
      .map(({ id, technical, expiresOn, purchasedOn, receivedAt, remaining }) => ({
        id,
        technical,
        expiresOn,
        purchasedOn,
        receivedAt: new Date(receivedAt),
        remaining,
      }));
  }

  async openTechnicalLot(key: ProductStockKey): Promise<string> {
    this.beforeWrite("openTechnicalLot");
    const id = `lot-${this.state.lots.length + 1}`;
    this.state.lots.push({
      id,
      productId: key.productId,
      locationId: key.locationId,
      technical: true,
      expiresOn: null,
      purchasedOn: null,
      receivedAt: this.receptionMoment(),
      remaining: 0,
      purchaseLineId: null,
      quantityReceived: 0,
      costTotalCents: null,
      costQuantity: null,
      lotNumber: null,
      costComplete: false,
      originMovementId: null,
      assemblyBatchId: null,
      withdrawn: false,
    });
    return id;
  }

  async recordLot(lot: NewLot): Promise<string> {
    this.beforeWrite("recordLot");
    const id = `lot-${this.state.lots.length + 1}`;
    this.state.lots.push({
      id,
      productId: lot.productId,
      locationId: lot.locationId,
      technical: false,
      expiresOn: lot.expiresOn,
      purchasedOn: lot.purchasedOn,
      receivedAt: this.receptionMoment(),
      remaining: 0,
      purchaseLineId: lot.purchaseLineId,
      quantityReceived: lot.quantityReceived,
      costTotalCents: lot.costTotalCents,
      costQuantity: lot.costQuantity,
      lotNumber: lot.lotNumber,
      costComplete: true,
      originMovementId: null,
      assemblyBatchId: null,
      withdrawn: false,
    });
    return id;
  }

  async recordInitialCountLot(lot: NewInitialCountLot): Promise<string> {
    this.beforeWrite("recordInitialCountLot");
    const id = `lot-${this.state.lots.length + 1}`;
    this.state.lots.push({
      id,
      productId: lot.productId,
      locationId: lot.locationId,
      technical: false,
      expiresOn: lot.expiresOn,
      purchasedOn: null,
      receivedAt: this.receptionMoment(),
      remaining: 0,
      purchaseLineId: null,
      quantityReceived: lot.quantityReceived,
      costTotalCents: null,
      costQuantity: null,
      lotNumber: null,
      costComplete: false,
      originMovementId: lot.originMovementId,
      assemblyBatchId: null,
      withdrawn: false,
    });
    return id;
  }

  async recordBatchLot(lot: NewBatchLot): Promise<string> {
    this.beforeWrite("recordBatchLot");
    const id = `lot-${this.state.lots.length + 1}`;
    this.state.lots.push({
      id,
      productId: lot.productId,
      locationId: lot.locationId,
      technical: false,
      expiresOn: lot.expiresOn,
      purchasedOn: null,
      receivedAt: this.receptionMoment(),
      remaining: 0,
      purchaseLineId: null,
      quantityReceived: lot.quantityReceived,
      costTotalCents: lot.costTotalCents,
      costQuantity: lot.costQuantity,
      lotNumber: null,
      costComplete: !lot.costIncomplete,
      originMovementId: null,
      assemblyBatchId: lot.assemblyBatchId,
      withdrawn: false,
    });
    return id;
  }

  async insertAssemblyBatch(batch: NewAssemblyBatch): Promise<string> {
    this.beforeWrite("insertAssemblyBatch");
    const id = `batch-${this.state.batches.length + 1}`;
    this.state.batches.push({
      ...batch,
      id,
      lines: batch.lines.map((line) => ({ ...line })),
    });
    return id;
  }

  async recipe(productId: string): Promise<Recipe | undefined> {
    this.store.operationOrder.push("recipe");
    const recipe = this.state.recipes.find((row) => row.productId === productId);
    return (
      recipe && {
        ...recipe,
        components: recipe.components.map((component) => ({ ...component })),
      }
    );
  }

  async activeProductIds(productIds: readonly string[]): Promise<string[]> {
    this.store.operationOrder.push("activeProductIds");
    return productIds.filter((id) =>
      this.state.products.some((row) => row.id === id && row.active !== false),
    );
  }

  async lotCosts(lotIds: readonly string[]): Promise<BatchLotCost[]> {
    this.store.operationOrder.push("lotCosts");
    return this.state.lots
      .filter((lot) => lotIds.includes(lot.id))
      .map((lot) => {
        const cost: LotCost | null =
          lot.costTotalCents !== null && lot.costQuantity !== null
            ? { totalCents: lot.costTotalCents, quantity: lot.costQuantity }
            : null;
        return {
          lotId: lot.id,
          cost,
          costIncomplete: isLotCostIncomplete({
            technical: lot.technical,
            costIncomplete: !lot.costComplete,
          }),
          expiresOn: lot.expiresOn,
        };
      });
  }

  async openingCountLot(
    locationId: string,
    movementId: string,
  ): Promise<OpeningCountLot | undefined> {
    this.store.operationOrder.push("openingCountLot");
    const lot = this.state.lots.find(
      (row) => row.locationId === locationId && row.originMovementId === movementId,
    );
    return (
      lot && {
        lotId: lot.id,
        productId: lot.productId,
        counted: lot.quantityReceived,
        withdrawn: lot.withdrawn,
      }
    );
  }

  async markOpeningCountWithdrawn(lotId: string): Promise<void> {
    this.beforeWrite("markOpeningCountWithdrawn");
    const lot = this.state.lots.find((row) => row.id === lotId);
    if (!lot) {
      throw new Error(`lot ${lotId} does not exist`);
    }
    lot.withdrawn = true;
  }

  async allocateToLot(allocation: LotAllocation): Promise<void> {
    this.beforeWrite("allocateToLot");
    const lot = this.state.lots.find((row) => row.id === allocation.lotId);
    if (!lot) {
      throw new Error(`lot ${allocation.lotId} does not exist`);
    }
    lot.remaining += allocation.quantity;
    this.state.allocations.push({ ...allocation });
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

  private receptionMoment(): Date {
    return new Date(Date.UTC(2026, 0, 1) + this.state.lots.length * 1_000);
  }

  private beforeWrite(operation: WriteOperation): void {
    this.store.operationOrder.push(operation);
    if (this.store.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }
}

export class FakeStockStore implements StockStore, AssemblyBatchStore {
  private state: FakeStockState = {
    products: [],
    balances: [],
    movements: [],
    counts: [],
    countedLots: [],
    lots: [],
    allocations: [],
    batches: [],
    recipes: [],
    nextId: 1,
  };

  failingWrites = new Set<WriteOperation>();
  operationOrder: string[] = [];
  lockedProducts: string[] = [];

  seedProduct(product: FakeStockProduct): void {
    this.state.products.push({ ...product });
  }

  seedBalance(balance: FakeStockBalance): void {
    this.state.balances.push({ ...balance });
  }

  seedLot(
    lot: Partial<FakeStockLot> & Pick<FakeStockLot, "id" | "productId" | "locationId">,
  ): void {
    this.state.lots.push({
      technical: false,
      expiresOn: null,
      purchasedOn: "2026-01-01",
      receivedAt: new Date("2026-01-01T12:00:00.000Z"),
      remaining: 0,
      purchaseLineId: null,
      quantityReceived: 0,
      costTotalCents: null,
      costQuantity: null,
      lotNumber: null,
      costComplete: !lot.technical,
      originMovementId: null,
      assemblyBatchId: null,
      withdrawn: false,
      ...lot,
    });
  }

  seedRecipe(recipe: Recipe): void {
    this.state.recipes.push({
      ...recipe,
      components: recipe.components.map((component) => ({ ...component })),
    });
  }

  seedMovement(movement: Omit<FakeStockMovement, "id">): string {
    const id = `movement-${this.state.nextId++}`;
    this.state.movements.push({ ...movement, id });
    return id;
  }

  seedAllocation(allocation: LotAllocation): void {
    this.state.allocations.push({ ...allocation });
  }

  balanceOf(key: ProductStockKey): number {
    return this.state.balances.find((row) => sameKey(row, key))?.quantity ?? 0;
  }

  snapshot(): FakeStockState {
    return cloneState(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: AssemblyBatchTransaction) => Promise<TOutcome>,
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
