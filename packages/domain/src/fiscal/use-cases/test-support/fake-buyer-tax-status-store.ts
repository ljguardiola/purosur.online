import type {
  BuyerTaxStatusSetVersion,
  BuyerTaxStatusStore,
  BuyerTaxStatusStoreTransaction,
} from "../buyer-tax-status-store.js";

function cloneVersions(versions: BuyerTaxStatusSetVersion[]): BuyerTaxStatusSetVersion[] {
  return versions.map((version) => ({
    paramsVersion: version.paramsVersion,
    options: version.options.map((option) => ({ ...option })),
  }));
}

class FakeTransaction implements BuyerTaxStatusStoreTransaction {
  private readonly versions: BuyerTaxStatusSetVersion[];
  private readonly store: FakeBuyerTaxStatusStore;

  constructor(versions: BuyerTaxStatusSetVersion[], store: FakeBuyerTaxStatusStore) {
    this.versions = versions;
    this.store = store;
  }

  async lockCurrentBuyerTaxStatusSet(): Promise<BuyerTaxStatusSetVersion | undefined> {
    this.store.operationOrder.push("lockCurrentBuyerTaxStatusSet");
    const [current] = cloneVersions(this.versions).sort(
      (a, b) => b.paramsVersion - a.paramsVersion,
    );
    return current;
  }

  async recordBuyerTaxStatusSet(set: BuyerTaxStatusSetVersion): Promise<void> {
    this.store.operationOrder.push("recordBuyerTaxStatusSet");
    this.versions.push(...cloneVersions([set]));
  }
}

export class FakeBuyerTaxStatusStore implements BuyerTaxStatusStore {
  private versions: BuyerTaxStatusSetVersion[] = [];

  operationOrder: string[] = [];
  transactionCount = 0;

  seedVersion(version: BuyerTaxStatusSetVersion): void {
    this.versions.push(...cloneVersions([version]));
  }

  snapshot(): BuyerTaxStatusSetVersion[] {
    return cloneVersions(this.versions);
  }

  async transaction<TOutcome>(
    work: (tx: BuyerTaxStatusStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    this.transactionCount += 1;
    const before = cloneVersions(this.versions);
    try {
      return await work(new FakeTransaction(this.versions, this));
    } catch (error) {
      this.versions = before;
      throw error;
    }
  }
}
