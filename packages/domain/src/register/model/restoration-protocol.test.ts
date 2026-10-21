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
  it("names the three steps nothing delivers yet", () => {
    expect(UNDELIVERED_RESTORATION_STEPS).toEqual([
      "recover_contingency_tickets",
      "reconcile_fiscal_counters",
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

  it("names the earliest pending step when a later one is pending too", () => {
    expect(restorationStanding(evidence({ enroll: "pending", replenish: "pending" }))).toEqual({
      kind: "in_progress",
      step: "enroll",
    });
  });

  it("names the first pending delivered step for every combination of evidence", () => {
    const step = fc.constantFrom("completed" as const, "pending" as const);
    fc.assert(
      fc.property(step, step, step, step, (enroll, restore, reset, replenish) => {
        const combination: RestorationEvidence = {
          enroll,
          restore,
          reset_sync_identity: reset,
          replenish,
        };
        const firstPending = RESTORATION_STEPS.find(
          (name) =>
            name in combination && combination[name as keyof RestorationEvidence] === "pending",
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
