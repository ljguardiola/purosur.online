import type { PreEmissionGateFailureReason, PreEmissionGateOutcome } from "./pre-emission-gate.js";

export type LatestPreEmissionGateOutcome =
  | { kind: "passed" }
  | Extract<PreEmissionGateOutcome, { kind: "failed" }>;

export type FiscalEmissionStoppedReport =
  | { fiscal_emission_stopped?: undefined; fiscal_emission_stopped_reason?: undefined }
  | { fiscal_emission_stopped: false; fiscal_emission_stopped_reason?: undefined }
  | {
      fiscal_emission_stopped: true;
      fiscal_emission_stopped_reason: PreEmissionGateFailureReason;
    };

export function fiscalEmissionStopReasonOf(
  latest: LatestPreEmissionGateOutcome | undefined,
): PreEmissionGateFailureReason | undefined {
  return latest?.kind === "failed" ? latest.reason : undefined;
}

export function fiscalEmissionStoppedReportOf(
  latest: LatestPreEmissionGateOutcome | undefined,
): FiscalEmissionStoppedReport {
  const reason = fiscalEmissionStopReasonOf(latest);
  if (reason === undefined) {
    return { fiscal_emission_stopped: false };
  }
  return { fiscal_emission_stopped: true, fiscal_emission_stopped_reason: reason };
}
