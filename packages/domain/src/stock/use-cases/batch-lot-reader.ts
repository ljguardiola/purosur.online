import type { StockLot } from "../model/lot-allocation.js";
import type { LotCost } from "../model/lot-value.js";
import type { ProductStockKey } from "./stock-store.js";

export interface PreviewLot extends StockLot {
  cost: LotCost | null;
  costIncomplete: boolean;
}

export interface BatchLotReader {
  productLots(key: ProductStockKey): Promise<PreviewLot[]>;
}
