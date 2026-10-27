import type { ZoneTransition } from "../../shared/index.js";
import type { ZoneRulesPublication } from "../model/zone-rules-version.js";

export interface PublishedZoneRules extends ZoneRulesPublication {
  transitions: readonly ZoneTransition[];
}

export interface ZoneRulesPorts {
  store: ZoneRulesStore;
}

export interface ZoneRulesStore {
  transaction<TOutcome>(
    work: (tx: ZoneRulesStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface ZoneRulesStoreTransaction {
  lockZoneRulesPublication(): Promise<void>;
  zoneRulesPublications(): Promise<ZoneRulesPublication[]>;
  publishZoneRules(rules: PublishedZoneRules): Promise<void>;
}
