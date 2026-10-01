import type { BuyerTaxStatusOption } from "../model/buyer-tax-status-set.js";

export interface BuyerTaxStatusSetVersion {
  paramsVersion: number;
  options: BuyerTaxStatusOption[];
}

export interface BuyerTaxStatusPorts {
  store: BuyerTaxStatusStore;
}

export interface BuyerTaxStatusStore {
  transaction<TOutcome>(
    work: (tx: BuyerTaxStatusStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface BuyerTaxStatusStoreTransaction {
  lockCurrentBuyerTaxStatusSet(): Promise<BuyerTaxStatusSetVersion | undefined>;
  recordBuyerTaxStatusSet(set: BuyerTaxStatusSetVersion): Promise<void>;
}
