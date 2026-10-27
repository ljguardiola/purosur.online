import type { ZoneRulesPublication } from "../../model/zone-rules-version.js";
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
    publicationNumber: rules.publicationNumber,
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

  async zoneRulesPublications(): Promise<ZoneRulesPublication[]> {
    this.store.operationOrder.push("zoneRulesPublications");
    return this.published.map(({ version, publicationNumber }) => ({ version, publicationNumber }));
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
