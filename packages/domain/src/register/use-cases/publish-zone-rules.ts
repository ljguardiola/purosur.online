import type { ZoneTransition } from "../../shared/index.js";
import type { ZoneRulesPorts } from "./zone-rules-store.js";

export interface PublishZoneRulesInput {
  version: string;
  transitions: readonly ZoneTransition[];
}

export type PublishZoneRulesOutcome =
  | { kind: "published"; version: string }
  | { kind: "already_published"; version: string };

export async function publishZoneRules(
  { store, clock }: ZoneRulesPorts,
  { version, transitions }: PublishZoneRulesInput,
): Promise<PublishZoneRulesOutcome> {
  return store.transaction<PublishZoneRulesOutcome>(async (tx) => {
    await tx.lockZoneRulesPublication();
    if (await tx.isZoneRulesVersionPublished(version)) {
      return { kind: "already_published", version };
    }
    await tx.publishZoneRules({ version, transitions, publishedAt: clock.now() });
    return { kind: "published", version };
  });
}
