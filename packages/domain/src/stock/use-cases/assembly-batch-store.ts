import type { Clock } from "../../shared/index.js";
import type { BatchComponentUse } from "../model/assembly-batch.js";
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

export interface AssemblyBatchTransaction extends StockStoreTransaction {
  recipe(productId: string): Promise<Recipe | undefined>;
  activeProductIds(productIds: readonly string[]): Promise<string[]>;
  lotCosts(lotIds: readonly string[]): Promise<BatchLotCost[]>;
  insertAssemblyBatch(batch: NewAssemblyBatch): Promise<string>;
  recordBatchLot(lot: NewBatchLot): Promise<string>;
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
