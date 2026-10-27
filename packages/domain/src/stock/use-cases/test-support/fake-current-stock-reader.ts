import type { CurrentStockReader } from "../current-stock-reader.js";
import type { StockLevel } from "../stock-reader.js";

export class FakeCurrentStockReader implements CurrentStockReader {
  private readonly levels: StockLevel[];

  readonly reads: string[] = [];

  constructor(levels: StockLevel[]) {
    this.levels = levels;
  }

  async everyStockLevel(locationId: string): Promise<StockLevel[]> {
    this.reads.push(locationId);
    return this.levels.map((level) => ({ ...level, lots: level.lots.map((lot) => ({ ...lot })) }));
  }
}
