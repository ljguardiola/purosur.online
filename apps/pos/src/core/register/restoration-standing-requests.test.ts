import type { RestorationEvidence } from "@purosur/domain";
import { describe, expect, it } from "vitest";
import { restorationStandingFor } from "./restoration-standing-requests";

const COMPLETED: RestorationEvidence = {
  enroll: "completed",
  restore: "completed",
  reset_sync_identity: "completed",
  replenish: "completed",
  reconcile_fiscal_counters: "completed",
};

describe("the restoration standing the register answers", () => {
  it("is completed when every step holds its evidence", () => {
    expect(restorationStandingFor({ evidence: () => COMPLETED })).toEqual({ kind: "completed" });
  });

  it("is in progress at the first step whose evidence is pending", () => {
    expect(
      restorationStandingFor({
        evidence: () => ({ ...COMPLETED, reset_sync_identity: "pending", replenish: "pending" }),
      }),
    ).toEqual({ kind: "in_progress", step: "reset_sync_identity" });
  });
});
