import type { Clock } from "../../shared/index.js";
import type { BatchComponentUse, BatchLotMovement } from "../model/assembly-batch.js";
import type { NewBatchLot } from "../model/lot.js";
import type { LotCost } from "../model/lot-value.js";
import type { Recipe } from "./recipe-store.js";
import type { StockStore, StockStoreTransaction } from "./stock-store.js";

export interface NewAssemblyBatch {
  productId: string;
  locationId: string;
  assembledAt: Date;
  output: number;
  actorId: string;
  lines: readonly BatchComponentUse[];
}

export interface BatchLotCost {
  lotId: string;
  cost: LotCost | null;
  costIncomplete: boolean;
  expiresOn: string | null;
}

export interface LockedAssemblyBatch {
  id: string;
  productId: string;
  lotId: string;
  voided: boolean;
  componentProductIds: string[];
}

export interface BatchMovementAllocation {
  productId: string;
  kind: "assembly_out" | "assembly_in";
  lotId: string;
  quantity: number;
}

export interface AssemblyBatchVoid {
  batchId: string;
  voidedAt: Date;
  actorId: string;
}

export interface AssemblyBatchTransaction extends StockStoreTransaction {
  recipe(productId: string): Promise<Recipe | undefined>;
  activeProductIds(productIds: readonly string[]): Promise<string[]>;
  lotCosts(lotIds: readonly string[]): Promise<BatchLotCost[]>;
  insertAssemblyBatch(batch: NewAssemblyBatch): Promise<string>;
  recordBatchLot(lot: NewBatchLot): Promise<string>;
  lockAssemblyBatch(batchId: string, locationId: string): Promise<LockedAssemblyBatch | undefined>;
  assemblyBatchAllocations(batchId: string): Promise<BatchMovementAllocation[]>;
  batchLotMovements(batchId: string): Promise<BatchLotMovement[]>;
  recordAssemblyBatchVoid(batchVoid: AssemblyBatchVoid): Promise<void>;
}

export interface AssemblyBatchStore extends StockStore {
  transaction<TOutcome>(
    work: (tx: AssemblyBatchTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface AssemblyBatchPorts {
  store: AssemblyBatchStore;
  clock: Clock;
}
