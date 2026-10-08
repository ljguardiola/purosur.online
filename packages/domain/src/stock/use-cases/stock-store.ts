import type { SaleUnit } from "../../catalog/index.js";
import type { Clock } from "../../shared/index.js";
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

export interface StockStore {
  transaction<TOutcome>(work: (tx: StockStoreTransaction) => Promise<TOutcome>): Promise<TOutcome>;
}

export interface StockStoreTransaction {
  lockProductStock(key: ProductStockKey): Promise<LockProductStockResult>;
  earliestCountAtOrAfter(key: ProductStockKey, at: Date): Promise<CoveringCount | undefined>;
  appliedDeltaAfter(key: ProductStockKey, at: Date): Promise<number>;
  recordMovement(movement: NewStockMovement): Promise<string>;
  recordCount(count: NewStockCount): Promise<void>;
  addToBalance(key: ProductStockKey, delta: number): Promise<number>;
}
