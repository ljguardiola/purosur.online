import { describe, expect, it } from "vitest";
import {
  fiscalEmissionStopReasonOf,
  fiscalEmissionStoppedReportOf,
  type LatestPreEmissionGateOutcome,
} from "./fiscal-emission-stop.js";
import { PRE_EMISSION_GATE_FAILURE_REASONS } from "./pre-emission-gate.js";

const PASSED: LatestPreEmissionGateOutcome = { kind: "passed" };

describe("fiscalEmissionStopReasonOf", () => {
  it("finds a register that has never evaluated the pre-emission check not stopped", () => {
    expect(fiscalEmissionStopReasonOf(undefined)).toBeUndefined();
  });

  it("finds a register whose latest sale passed the check not stopped", () => {
    expect(fiscalEmissionStopReasonOf(PASSED)).toBeUndefined();
  });

  it.each(
    PRE_EMISSION_GATE_FAILURE_REASONS,
  )("finds a register whose latest sale failed the check for %s stopped, for that reason", (reason) => {
    expect(fiscalEmissionStopReasonOf({ kind: "failed", reason })).toBe(reason);
  });
});

describe("fiscalEmissionStoppedReportOf", () => {
  it("reports a register that has never evaluated the check as not stopped", () => {
    expect(fiscalEmissionStoppedReportOf(undefined)).toStrictEqual({
      fiscal_emission_stopped: false,
    });
  });

  it("reports a register whose latest sale passed the check as not stopped", () => {
    expect(fiscalEmissionStoppedReportOf(PASSED)).toStrictEqual({ fiscal_emission_stopped: false });
  });

  it("reports a register whose latest sale failed the check as stopped, with the reason", () => {
    expect(
      fiscalEmissionStoppedReportOf({ kind: "failed", reason: "legal_name_missing" }),
    ).toStrictEqual({
      fiscal_emission_stopped: true,
      fiscal_emission_stopped_reason: "legal_name_missing",
    });
  });
});
