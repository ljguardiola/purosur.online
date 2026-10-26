import type { ReplenishmentFailureKind } from "../../shared/index.js";

export const RESTORATION_STEPS = [
  "enroll",
  "restore",
  "reset_sync_identity",
  "replenish",
  "recover_contingency_tickets",
  "reconcile_fiscal_counters",
  "regularize_orphan_authorizations",
  "open_session",
] as const;

type RestorationStep = (typeof RESTORATION_STEPS)[number];

type DeliveredRestorationStep = Exclude<RestorationStep, "open_session">;

type RestorationStepEvidence = "completed" | "pending";

type ReplenishmentFailureEvidence = ReplenishmentFailureKind;

type RestoringStepEvidence<Step extends DeliveredRestorationStep> = Step extends "restore"
  ? RestorationStepEvidence | "failed"
  : Step extends "replenish"
    ? RestorationStepEvidence | ReplenishmentFailureEvidence
    : RestorationStepEvidence;

type ReplenishmentOrigin = "copy" | "no_copy";

type CloudEvidence = "reachable" | "unreachable" | "unknown";

export type RestorationEvidence = Readonly<
  { [Step in DeliveredRestorationStep]: RestoringStepEvidence<Step> } & {
    origin: ReplenishmentOrigin;
    cloud: CloudEvidence;
  }
>;

export type RestorationStanding =
  | { kind: "completed" }
  | { kind: "in_progress"; step: DeliveredRestorationStep; origin: ReplenishmentOrigin }
  | {
      kind: "without_connection";
      step: Exclude<DeliveredRestorationStep, "enroll">;
      origin: ReplenishmentOrigin;
    }
  | { kind: "failed"; step: "restore" }
  | {
      kind: "failed";
      step: "replenish";
      failure: ReplenishmentFailureEvidence;
      origin: ReplenishmentOrigin;
    };

const DELIVERED_STEPS = [
  "enroll",
  "restore",
  "reset_sync_identity",
  "replenish",
  "recover_contingency_tickets",
  "reconcile_fiscal_counters",
  "regularize_orphan_authorizations",
] as const satisfies readonly DeliveredRestorationStep[];

export function restorationStanding(evidence: RestorationEvidence): RestorationStanding {
  const held = DELIVERED_STEPS.find((step) => evidence[step] !== "completed");
  if (held === undefined) {
    return { kind: "completed" };
  }
  if (held === "restore" && evidence.restore === "failed") {
    return { kind: "failed", step: held };
  }
  const { replenish } = evidence;
  if (held === "replenish" && (replenish === "refused" || replenish === "unreadable_event")) {
    return { kind: "failed", step: held, failure: replenish, origin: evidence.origin };
  }
  if (held !== "enroll" && evidence.cloud === "unreachable") {
    return { kind: "without_connection", step: held, origin: evidence.origin };
  }
  return { kind: "in_progress", step: held, origin: evidence.origin };
}
