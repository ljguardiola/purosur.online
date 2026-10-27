import type { ZoneTransition } from "../../shared/index.js";
import { nextZoneRulesPublicationNumber } from "../model/zone-rules-version.js";
import type { ZoneRulesPorts } from "./zone-rules-store.js";

export interface PublishZoneRulesInput {
  version: string;
  transitions: readonly ZoneTransition[];
}

export type PublishZoneRulesOutcome =
  | { kind: "published"; version: string }
  | { kind: "already_published"; version: string };

export async function publishZoneRules(
  { store }: ZoneRulesPorts,
  { version, transitions }: PublishZoneRulesInput,
): Promise<PublishZoneRulesOutcome> {
  return store.transaction<PublishZoneRulesOutcome>(async (tx) => {
    await tx.lockZoneRulesPublication();
    const publications = await tx.zoneRulesPublications();
    if (publications.some((publication) => publication.version === version)) {
      return { kind: "already_published", version };
    }
    await tx.publishZoneRules({
      version,
      transitions,
      publicationNumber: nextZoneRulesPublicationNumber(publications),
    });
    return { kind: "published", version };
  });
}
