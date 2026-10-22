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

export type RestorationStep = (typeof RESTORATION_STEPS)[number];

export const UNDELIVERED_RESTORATION_STEPS = [
  "recover_contingency_tickets",
  "regularize_orphan_authorizations",
] as const satisfies readonly RestorationStep[];

type DeliveredRestorationStep = Exclude<
  RestorationStep,
  "open_session" | (typeof UNDELIVERED_RESTORATION_STEPS)[number]
>;

type RestorationStepEvidence = "completed" | "pending";

type FailableRestorationStep = "restore";

type RestoringStepEvidence<Step extends DeliveredRestorationStep> =
  Step extends FailableRestorationStep
    ? RestorationStepEvidence | "failed"
    : RestorationStepEvidence;

export type CloudEvidence = "reachable" | "unreachable" | "unknown";

export type RestorationEvidence = Readonly<
  { [Step in DeliveredRestorationStep]: RestoringStepEvidence<Step> } & {
    cloud: CloudEvidence;
  }
>;

type HeldRestorationStep = Exclude<RestorationStep, "open_session">;

export type RestorationStanding =
  | { kind: "completed" }
  | { kind: "in_progress"; step: HeldRestorationStep }
  | { kind: "without_connection"; step: Exclude<HeldRestorationStep, "enroll"> }
  | { kind: "failed"; step: FailableRestorationStep };

const DELIVERED_STEPS = [
  "enroll",
  "restore",
  "reset_sync_identity",
  "replenish",
  "reconcile_fiscal_counters",
] as const satisfies readonly DeliveredRestorationStep[];

export function restorationStanding(evidence: RestorationEvidence): RestorationStanding {
  const held = DELIVERED_STEPS.find((step) => evidence[step] !== "completed");
  if (held === undefined) {
    return { kind: "completed" };
  }
  if (held === "restore" && evidence.restore === "failed") {
    return { kind: "failed", step: held };
  }
  if (held !== "enroll" && evidence.cloud === "unreachable") {
    return { kind: "without_connection", step: held };
  }
  return { kind: "in_progress", step: held };
}
