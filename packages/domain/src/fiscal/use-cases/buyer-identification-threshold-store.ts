import type { Clock } from "../../shared/index.js";
import type { BuyerIdentificationThreshold } from "../model/buyer-identification-threshold.js";

export interface BuyerIdentificationThresholdPorts {
  store: BuyerIdentificationThresholdStore;
  clock: Clock;
}

export interface NewBuyerIdentificationThreshold {
  amount: number;
  validFrom: string;
  revision: number;
  actorId: string;
  replaced: BuyerIdentificationThreshold | undefined;
}

export interface BuyerIdentificationThresholdStore {
  transaction<TOutcome>(
    work: (tx: BuyerIdentificationThresholdStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface BuyerIdentificationThresholdStoreTransaction {
  lockBuyerIdentificationThresholds(): Promise<void>;
  readThresholdStartingOn(day: string): Promise<BuyerIdentificationThreshold | undefined>;
  readThresholdInEffectOn(day: string): Promise<BuyerIdentificationThreshold | undefined>;
  recordBuyerIdentificationThreshold(
    threshold: NewBuyerIdentificationThreshold,
  ): Promise<BuyerIdentificationThreshold>;
}

export interface BuyerIdentificationThresholdOverview {
  inEffect: BuyerIdentificationThreshold | undefined;
  scheduled: BuyerIdentificationThreshold | undefined;
}

export interface BuyerIdentificationThresholdReader {
  readBuyerIdentificationThresholdOverview(
    day: string,
  ): Promise<BuyerIdentificationThresholdOverview>;
}
