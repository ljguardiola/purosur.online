import type {
  SupplierPriceListReadingInProgress,
  SupplierPriceListReadings,
} from "../supplier-price-list-readings.js";

export class FakeSupplierPriceListReadings implements SupplierPriceListReadings {
  inProgress: SupplierPriceListReadingInProgress[];

  constructor(inProgress: SupplierPriceListReadingInProgress[] = []) {
    this.inProgress = inProgress;
  }

  async listInProgress(): Promise<SupplierPriceListReadingInProgress[]> {
    return this.inProgress.map((reading) => ({ ...reading }));
  }
}
