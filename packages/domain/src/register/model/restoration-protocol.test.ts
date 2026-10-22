import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  RESTORATION_STEPS,
  type RestorationEvidence,
  restorationStanding,
  UNDELIVERED_RESTORATION_STEPS,
} from "./restoration-protocol.js";

const ALL_COMPLETED: RestorationEvidence = {
  enroll: "completed",
  restore: "completed",
  reset_sync_identity: "completed",
  replenish: "completed",
  reconcile_fiscal_counters: "completed",
  cloud: "unknown",
};

function evidence(overrides: Partial<RestorationEvidence>): RestorationEvidence {
  return { ...ALL_COMPLETED, ...overrides };
}

describe("RESTORATION_STEPS", () => {
  it("runs from enrolling to opening the session", () => {
    expect(RESTORATION_STEPS).toEqual([
      "enroll",
      "restore",
      "reset_sync_identity",
      "replenish",
      "recover_contingency_tickets",
      "reconcile_fiscal_counters",
      "regularize_orphan_authorizations",
      "open_session",
    ]);
  });
});

describe("UNDELIVERED_RESTORATION_STEPS", () => {
  it("names the two steps nothing delivers yet", () => {
    expect(UNDELIVERED_RESTORATION_STEPS).toEqual([
      "recover_contingency_tickets",
      "regularize_orphan_authorizations",
    ]);
  });
});

describe("restorationStanding", () => {
  it("is completed when every delivered step is completed", () => {
    expect(restorationStanding(ALL_COMPLETED)).toEqual({ kind: "completed" });
  });

  it("is in progress at the enroll step while enrollment is pending", () => {
    expect(restorationStanding(evidence({ enroll: "pending" }))).toEqual({
      kind: "in_progress",
      step: "enroll",
    });
  });

  it("is in progress at the restore step while only the restore is pending", () => {
    expect(restorationStanding(evidence({ restore: "pending" }))).toEqual({
      kind: "in_progress",
      step: "restore",
    });
  });

  it("is in progress at the sync identity reset after the restore completed", () => {
    expect(restorationStanding(evidence({ reset_sync_identity: "pending" }))).toEqual({
      kind: "in_progress",
      step: "reset_sync_identity",
    });
  });

  it("is in progress at the replenishment while only it is pending", () => {
    expect(restorationStanding(evidence({ replenish: "pending" }))).toEqual({
      kind: "in_progress",
      step: "replenish",
    });
  });

  it("is held by every step that is neither undelivered nor the session opening", () => {
    const undelivered: readonly string[] = UNDELIVERED_RESTORATION_STEPS;
    const heldBy = RESTORATION_STEPS.filter(
      (step) => step !== "open_session" && !undelivered.includes(step),
    );

    for (const step of heldBy) {
      expect(restorationStanding({ ...ALL_COMPLETED, [step]: "pending" })).toEqual({
        kind: "in_progress",
        step,
      });
    }
  });

  it("is in progress at the fiscal counters reconciliation while only it is pending", () => {
    expect(restorationStanding(evidence({ reconcile_fiscal_counters: "pending" }))).toEqual({
      kind: "in_progress",
      step: "reconcile_fiscal_counters",
    });
  });

  it("names the earliest pending step when a later one is pending too", () => {
    expect(restorationStanding(evidence({ enroll: "pending", replenish: "pending" }))).toEqual({
      kind: "in_progress",
      step: "enroll",
    });
  });

  it("names the first pending delivered step for every combination of evidence", () => {
    const step = fc.constantFrom("completed" as const, "pending" as const);
    fc.assert(
      fc.property(step, step, step, step, step, (enroll, restore, reset, replenish, counters) => {
        const combination: RestorationEvidence = {
          enroll,
          restore,
          reset_sync_identity: reset,
          replenish,
          reconcile_fiscal_counters: counters,
          cloud: "unknown",
        };
        const [firstPending] = RESTORATION_STEPS.filter(
          (name) => (combination as Readonly<Record<string, string>>)[name] === "pending",
        );

        expect(restorationStanding(combination)).toEqual(
          firstPending === undefined
            ? { kind: "completed" }
            : { kind: "in_progress", step: firstPending },
        );
      }),
    );
  });
});

describe("restorationStanding without the cloud", () => {
  const LATER_STEPS = [
    "restore",
    "reset_sync_identity",
    "replenish",
    "reconcile_fiscal_counters",
  ] as const;

  it("is without connection at every pending step after enrollment when the cloud is unreachable", () => {
    for (const step of LATER_STEPS) {
      expect(restorationStanding(evidence({ [step]: "pending", cloud: "unreachable" }))).toEqual({
        kind: "without_connection",
        step,
      });
    }
  });

  it("stays in progress at a pending step when the cloud is reachable or not yet known", () => {
    for (const cloud of ["reachable", "unknown"] as const) {
      expect(restorationStanding(evidence({ replenish: "pending", cloud }))).toEqual({
        kind: "in_progress",
        step: "replenish",
      });
    }
  });

  it("stays in progress at a pending enrollment whatever the cloud answers", () => {
    expect(restorationStanding(evidence({ enroll: "pending", cloud: "unreachable" }))).toEqual({
      kind: "in_progress",
      step: "enroll",
    });
  });

  it("names the earliest pending step as the one without connection", () => {
    expect(
      restorationStanding(
        evidence({ reset_sync_identity: "pending", replenish: "pending", cloud: "unreachable" }),
      ),
    ).toEqual({ kind: "without_connection", step: "reset_sync_identity" });
  });

  it("is completed when nothing is pending even if the cloud is unreachable", () => {
    expect(restorationStanding(evidence({ cloud: "unreachable" }))).toEqual({ kind: "completed" });
  });
});

describe("restorationStanding when the restore failed", () => {
  it("is failed at the restore step when no usable snapshot could be restored", () => {
    expect(restorationStanding(evidence({ restore: "failed" }))).toEqual({
      kind: "failed",
      step: "restore",
    });
  });

  it("is failed rather than without connection whatever the cloud answers", () => {
    for (const cloud of ["reachable", "unreachable", "unknown"] as const) {
      expect(restorationStanding(evidence({ restore: "failed", cloud }))).toEqual({
        kind: "failed",
        step: "restore",
      });
    }
  });

  it("stays in progress at a pending enrollment", () => {
    expect(restorationStanding(evidence({ enroll: "pending", restore: "failed" }))).toEqual({
      kind: "in_progress",
      step: "enroll",
    });
  });
});
