import type { StockLevel } from "./stock-reader.js";

export interface CurrentStockReader {
  everyStockLevel(locationId: string): Promise<StockLevel[]>;
}
