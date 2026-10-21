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
  "reconcile_fiscal_counters",
  "regularize_orphan_authorizations",
] as const satisfies readonly RestorationStep[];

export type DeliveredRestorationStep = Exclude<
  RestorationStep,
  "open_session" | (typeof UNDELIVERED_RESTORATION_STEPS)[number]
>;

export type RestorationStepEvidence = "completed" | "pending";

export type RestorationEvidence = Readonly<
  Record<DeliveredRestorationStep, RestorationStepEvidence>
>;

export type RestorationStanding =
  | { kind: "completed" }
  | { kind: "in_progress"; step: Exclude<RestorationStep, "open_session"> };

const DELIVERED_STEPS: readonly DeliveredRestorationStep[] = RESTORATION_STEPS.filter(
  (step): step is DeliveredRestorationStep =>
    step !== "open_session" &&
    !(UNDELIVERED_RESTORATION_STEPS as readonly RestorationStep[]).includes(step),
);

export function restorationStanding(evidence: RestorationEvidence): RestorationStanding {
  const pending = DELIVERED_STEPS.find((step) => evidence[step] === "pending");
  return pending === undefined ? { kind: "completed" } : { kind: "in_progress", step: pending };
}
