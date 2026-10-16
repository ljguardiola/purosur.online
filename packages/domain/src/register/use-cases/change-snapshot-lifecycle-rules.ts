import {
  areSnapshotLifecycleRulesWithinLimits,
  type SnapshotLifecycleRules,
  snapshotLifecycleRulesOrDefault,
} from "../model/snapshot-lifecycle-rules.js";
import type { ChangeSnapshotLifecycleRulesPorts } from "./snapshot-lifecycle-rules-ports.js";

export interface ChangeSnapshotLifecycleRulesInput {
  rules: SnapshotLifecycleRules;
  actorId: string;
}

export type ChangeSnapshotLifecycleRulesOutcome =
  | { kind: "out_of_limits" }
  | { kind: "unchanged" }
  | { kind: "changed"; rules: SnapshotLifecycleRules };

export async function changeSnapshotLifecycleRules(
  { store }: ChangeSnapshotLifecycleRulesPorts,
  { rules, actorId }: ChangeSnapshotLifecycleRulesInput,
): Promise<ChangeSnapshotLifecycleRulesOutcome> {
  if (!areSnapshotLifecycleRulesWithinLimits(rules)) {
    return { kind: "out_of_limits" };
  }
  const next = { hourly: rules.hourly, daily: rules.daily, monthly: rules.monthly };

  return store.transaction<ChangeSnapshotLifecycleRulesOutcome>(async (tx) => {
    const previous = snapshotLifecycleRulesOrDefault(await tx.lockLifecycleRules());
    if (
      previous.hourly === next.hourly &&
      previous.daily === next.daily &&
      previous.monthly === next.monthly
    ) {
      return { kind: "unchanged" };
    }
    await tx.recordLifecycleRulesChange({ previous: { ...previous }, next, actorId });
    return { kind: "changed", rules: next };
  });
}
