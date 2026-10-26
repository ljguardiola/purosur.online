import type {
  PublishedZoneRules,
  ZoneRulesStore,
  ZoneRulesStoreTransaction,
} from "../zone-rules-store.js";

function cloneRules(rules: PublishedZoneRules): PublishedZoneRules {
  return {
    version: rules.version,
    transitions: rules.transitions.map((transition) => ({
      from: new Date(transition.from),
      offsetMinutes: transition.offsetMinutes,
    })),
    publishedAt: new Date(rules.publishedAt),
  };
}

class FakeTransaction implements ZoneRulesStoreTransaction {
  private readonly published: PublishedZoneRules[];
  private readonly store: FakeZoneRulesStore;

  constructor(published: PublishedZoneRules[], store: FakeZoneRulesStore) {
    this.published = published;
    this.store = store;
  }

  async lockZoneRulesPublication(): Promise<void> {
    this.store.operationOrder.push("lockZoneRulesPublication");
  }

  async isZoneRulesVersionPublished(version: string): Promise<boolean> {
    this.store.operationOrder.push("isZoneRulesVersionPublished");
    return this.published.some((rules) => rules.version === version);
  }

  async publishZoneRules(rules: PublishedZoneRules): Promise<void> {
    this.store.operationOrder.push("publishZoneRules");
    this.published.push(cloneRules(rules));
  }
}

export class FakeZoneRulesStore implements ZoneRulesStore {
  private published: PublishedZoneRules[] = [];

  operationOrder: string[] = [];

  seed(rules: PublishedZoneRules): void {
    this.published.push(cloneRules(rules));
  }

  snapshot(): PublishedZoneRules[] {
    return this.published.map(cloneRules);
  }

  async transaction<TOutcome>(
    work: (tx: ZoneRulesStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = this.published.map(cloneRules);
    try {
      return await work(new FakeTransaction(this.published, this));
    } catch (error) {
      this.published = before;
      throw error;
    }
  }
}
