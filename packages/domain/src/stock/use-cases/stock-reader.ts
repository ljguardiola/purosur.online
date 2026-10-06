import type { SaleUnit } from "../../catalog/index.js";
import type { ManualStockMovementKind } from "../model/stock-movement-kind.js";
import type { AdjustmentReason, LossReason } from "../model/stock-movement-reason.js";
import type { ProductStockKey } from "./stock-store.js";

export interface StockProduct {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  saleUnit: SaleUnit;
  active: boolean;
}

export interface StockLevel extends StockProduct {
  balance: number;
}

export interface LedgerAtMoment {
  balance: number;
  appliedAfterCount: number;
}

export interface RecordedStockCount {
  id: string;
  productId: string;
  productName: string;
  categoryId: string;
  categoryName: string;
  saleUnit: SaleUnit;
  occurredAt: Date;
  expected: number;
  counted: number;
  delta: number;
  superseded: boolean;
}

export interface RecordedStockMovement {
  id: string;
  productId: string;
  productName: string;
  categoryName: string;
  saleUnit: SaleUnit;
  kind: ManualStockMovementKind;
  reason: LossReason | AdjustmentReason;
  delta: number;
  occurredAt: Date;
  superseded: boolean;
}

export interface StockPeriodQuery {
  locationId: string;
  since: Date;
}

export interface StockMovementsQuery extends StockPeriodQuery {
  kinds: readonly ManualStockMovementKind[];
}

export interface StockLedgerReader {
  product(productId: string): Promise<StockProduct | undefined>;
  ledgerAt(key: ProductStockKey, at: Date): Promise<LedgerAtMoment>;
}

export interface StockListReader {
  products(): Promise<StockProduct[]>;
  stockLevels(locationId: string): Promise<StockLevel[]>;
  counts(query: StockPeriodQuery): Promise<RecordedStockCount[]>;
  movements(query: StockMovementsQuery): Promise<RecordedStockMovement[]>;
}
