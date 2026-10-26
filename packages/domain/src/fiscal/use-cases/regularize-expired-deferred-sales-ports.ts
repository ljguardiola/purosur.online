import type { Clock } from "../../shared/index.js";
import type {
  DeferredSaleRegularizationTask,
  PendingDeferredSale,
} from "../model/deferred-sale-record.js";

export interface DeferredSaleCandidate extends PendingDeferredSale {
  lastAuthorizedIssuedOn: string | null;
}

export interface DeferredSaleExpiryTransaction {
  lockPendingDeferredSales(): Promise<DeferredSaleCandidate[]>;
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
