import type { StockLevel, StockListReader } from "../stock-reader.js";

export class FakeStockListReader implements Pick<StockListReader, "stockLevels"> {
  private readonly levels: StockLevel[];

  readonly reads: string[] = [];

  constructor(levels: StockLevel[]) {
    this.levels = levels;
  }

  async stockLevels(locationId: string): Promise<StockLevel[]> {
    this.reads.push(locationId);
    return this.levels.map((level) => ({ ...level, lots: level.lots.map((lot) => ({ ...lot })) }));
  }
}
