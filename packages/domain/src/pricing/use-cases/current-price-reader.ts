import type { CurrentPrice } from "./pricing-store.js";

export interface CurrentPriceReader {
  currentUnitPrices(locationId: string): Promise<Map<string, number>>;
  currentPriceOf(locationId: string, productId: string): Promise<CurrentPrice | null>;
}
