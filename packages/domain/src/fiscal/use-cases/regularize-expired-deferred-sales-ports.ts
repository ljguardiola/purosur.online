import type { Clock } from "../../shared/index.js";
import type {
  DeferredSaleRegularizationTask,
  ExpiredDeferredSale,
} from "../model/deferred-sale-record.js";

export type PendingDeferredSale = ExpiredDeferredSale;

export interface DeferredSaleExpiryTransaction {
  lockPendingDeferredSalesOccurredBefore(instant: Date): Promise<PendingDeferredSale[]>;
  recordExpiry(deferredSaleId: string, task: DeferredSaleRegularizationTask): Promise<void>;
}

export interface DeferredSaleExpiryStore {
  transaction<TOutcome>(
    work: (transaction: DeferredSaleExpiryTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface RegularizeExpiredDeferredSalesPorts {
  store: DeferredSaleExpiryStore;
  clock: Clock;
}
