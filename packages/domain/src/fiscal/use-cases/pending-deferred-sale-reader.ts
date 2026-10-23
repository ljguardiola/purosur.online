import type { PendingDeferredSale } from "../model/deferred-sale-record.js";

export interface PendingDeferredSaleReader {
  pendingDeferredSales(): Promise<PendingDeferredSale[]>;
}
