import type { PreEmissionGateFailureReason, PreEmissionGateOutcome } from "./pre-emission-gate.js";

export type FiscalAuthorization =
  | { kind: "authorized" }
  | { kind: "stopped"; reason: PreEmissionGateFailureReason };

export function fiscalAuthorizationAfter(
  latestEvaluation: PreEmissionGateOutcome | undefined,
): FiscalAuthorization {
  return latestEvaluation?.kind === "failed"
    ? { kind: "stopped", reason: latestEvaluation.reason }
    : { kind: "authorized" };
}
