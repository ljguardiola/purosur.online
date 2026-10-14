import type { BatchLotReader, PreviewLot } from "../batch-lot-reader.js";
import type { ProductStockKey } from "../stock-store.js";

export class FakeBatchLotReader implements BatchLotReader {
  private readonly lots: (PreviewLot & ProductStockKey)[];

  constructor(lots: (PreviewLot & ProductStockKey)[] = []) {
    this.lots = lots;
  }

  async productLots(key: ProductStockKey): Promise<PreviewLot[]> {
    return this.lots
      .filter((lot) => lot.productId === key.productId && lot.locationId === key.locationId)
      .map(({ productId: _productId, locationId: _locationId, ...lot }) => ({ ...lot }));
  }
}
