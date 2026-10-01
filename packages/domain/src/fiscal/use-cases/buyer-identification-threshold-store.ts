import type { BuyerIdentificationThreshold } from "../model/buyer-identification-threshold.js";

export interface BuyerIdentificationThresholdPorts {
  store: BuyerIdentificationThresholdStore;
}

export interface NewBuyerIdentificationThreshold {
  amount: number;
  validFrom: string;
  actorId: string;
}

export interface BuyerIdentificationThresholdStore {
  transaction<TOutcome>(
    work: (tx: BuyerIdentificationThresholdStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface BuyerIdentificationThresholdStoreTransaction {
  lockLatestBuyerIdentificationThreshold(): Promise<BuyerIdentificationThreshold | undefined>;
  recordBuyerIdentificationThreshold(
    threshold: NewBuyerIdentificationThreshold,
  ): Promise<BuyerIdentificationThreshold>;
}

export interface BuyerIdentificationThresholdReader {
  listBuyerIdentificationThresholds(): Promise<BuyerIdentificationThreshold[]>;
}
