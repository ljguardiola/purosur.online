import type { BuyerIdentificationThreshold } from "../../model/buyer-identification-threshold.js";
import type {
  BuyerIdentificationThresholdStore,
  BuyerIdentificationThresholdStoreTransaction,
  NewBuyerIdentificationThreshold,
} from "../buyer-identification-threshold-store.js";

export interface FakeThresholdState {
  thresholds: BuyerIdentificationThreshold[];
  audited: NewBuyerIdentificationThreshold[];
  nextId: number;
}

class FakeTransaction implements BuyerIdentificationThresholdStoreTransaction {
  private readonly state: FakeThresholdState;
  private readonly store: FakeBuyerIdentificationThresholdStore;

  constructor(state: FakeThresholdState, store: FakeBuyerIdentificationThresholdStore) {
    this.state = state;
    this.store = store;
  }

  async lockBuyerIdentificationThresholds(): Promise<void> {
    this.store.operationOrder.push("lockBuyerIdentificationThresholds");
  }

  async readThresholdStartingOn(day: string): Promise<BuyerIdentificationThreshold | undefined> {
    this.store.operationOrder.push("readThresholdStartingOn");
    const [current] = this.state.thresholds
      .filter((threshold) => threshold.validFrom === day)
      .sort((a, b) => b.revision - a.revision);
    return current && { ...current };
  }

  async readThresholdInEffectOn(day: string): Promise<BuyerIdentificationThreshold | undefined> {
    this.store.operationOrder.push("readThresholdInEffectOn");
    const [inEffect] = this.state.thresholds
      .filter((threshold) => threshold.validFrom <= day)
      .sort((a, b) => b.validFrom.localeCompare(a.validFrom) || b.revision - a.revision);
    return inEffect && { ...inEffect };
  }

  async recordBuyerIdentificationThreshold(
    threshold: NewBuyerIdentificationThreshold,
  ): Promise<BuyerIdentificationThreshold> {
    this.store.operationOrder.push("recordBuyerIdentificationThreshold");
    const recorded = {
      id: `threshold-${this.state.nextId++}`,
      amount: threshold.amount,
      validFrom: threshold.validFrom,
      revision: threshold.revision,
    };
    this.state.thresholds.push(recorded);
    this.state.audited.push({ ...threshold });
    return { ...recorded };
  }
}

function cloneState(state: FakeThresholdState): FakeThresholdState {
  return {
    thresholds: state.thresholds.map((row) => ({ ...row })),
    audited: state.audited.map((row) => ({ ...row })),
    nextId: state.nextId,
  };
}

export class FakeBuyerIdentificationThresholdStore implements BuyerIdentificationThresholdStore {
  private state: FakeThresholdState = { thresholds: [], audited: [], nextId: 1 };

  operationOrder: string[] = [];
  transactionCount = 0;

  seedThreshold(threshold: BuyerIdentificationThreshold): void {
    this.state.thresholds.push({ ...threshold });
  }

  snapshot(): FakeThresholdState {
    return cloneState(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: BuyerIdentificationThresholdStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionCount += 1;
    const before = cloneState(this.state);
    try {
      return await work(new FakeTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
