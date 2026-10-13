import type { SaleUnit } from "../../catalog/index.js";
import type { Clock } from "../../shared/index.js";
import type { NewInitialCountLot, NewLot } from "../model/lot.js";
import type { StockLot } from "../model/lot-allocation.js";
import type { StockMovementKind } from "../model/stock-movement-kind.js";
import type { AdjustmentReason, LossReason } from "../model/stock-movement-reason.js";

export interface StockPorts {
  store: StockStore;
  clock: Clock;
}

export interface ProductStockKey {
  productId: string;
  locationId: string;
}

export type LockProductStockResult =
  | { kind: "not_found" }
  | { kind: "locked"; saleUnit: SaleUnit; balance: number };

export interface CoveringCount {
  movementId: string;
  occurredAt: Date;
}

export interface NewStockMovement extends ProductStockKey {
  id?: string;
  saleLineId?: string;
  purchaseLineId?: string;
  assemblyBatchId?: string;
  kind: StockMovementKind;
  reason: LossReason | AdjustmentReason | null;
  delta: number;
  occurredAt: Date;
  actorId: string;
  supersededByCountId: string | null;
}

export interface NewStockCount {
  movementId: string;
  counted: number;
  expected: number;
}

export interface CountedLot {
  lotId: string;
  counted: number;
}

export interface LotAllocation {
  movementId: string;
  lotId: string;
  quantity: number;
}

export interface OpeningCountLot {
  lotId: string;
  productId: string;
  counted: number;
  withdrawn: boolean;
}

export interface StockStore {
  transaction<TOutcome>(work: (tx: StockStoreTransaction) => Promise<TOutcome>): Promise<TOutcome>;
}

export interface StockStoreTransaction {
  lockProductStock(key: ProductStockKey): Promise<LockProductStockResult>;
  earliestCountAtOrAfter(key: ProductStockKey, at: Date): Promise<CoveringCount | undefined>;
  appliedDeltaAfter(key: ProductStockKey, at: Date): Promise<number>;
  recordMovement(movement: NewStockMovement): Promise<string>;
  lotAllocationsAfter(key: ProductStockKey, at: Date): Promise<Map<string, number>>;
  recordCount(count: NewStockCount): Promise<void>;
  recordCountedLots(movementId: string, lots: readonly CountedLot[]): Promise<void>;
  productLots(key: ProductStockKey): Promise<StockLot[]>;
  openTechnicalLot(key: ProductStockKey): Promise<string>;
  recordLot(lot: NewLot): Promise<string>;
  recordInitialCountLot(lot: NewInitialCountLot): Promise<string>;
  openingCountLot(locationId: string, movementId: string): Promise<OpeningCountLot | undefined>;
  markOpeningCountWithdrawn(lotId: string): Promise<void>;
  allocateToLot(allocation: LotAllocation): Promise<void>;
  addToBalance(key: ProductStockKey, delta: number): Promise<number>;
}
