import type { Clock, ZoneTransition } from "../../shared/index.js";

export interface PublishedZoneRules {
  version: string;
  transitions: readonly ZoneTransition[];
  publishedAt: Date;
}

export interface ZoneRulesPorts {
  store: ZoneRulesStore;
  clock: Clock;
}

export interface ZoneRulesStore {
  transaction<TOutcome>(
    work: (tx: ZoneRulesStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface ZoneRulesStoreTransaction {
  lockZoneRulesPublication(): Promise<void>;
  isZoneRulesVersionPublished(version: string): Promise<boolean>;
  publishZoneRules(rules: PublishedZoneRules): Promise<void>;
}
