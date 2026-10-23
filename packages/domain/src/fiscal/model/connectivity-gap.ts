import type { FiscalEmissionMode } from "./fiscal-emission-mode.js";

export const CONTINGENCY_KINDS = ["offline_code", "deferring"] as const;

type ContingencyKind = (typeof CONTINGENCY_KINDS)[number];

export interface Contingency {
  kind: ContingencyKind;
  notice: boolean;
}

export function isConnectivityGap(
  mode: FiscalEmissionMode,
): mode is Exclude<FiscalEmissionMode, { kind: "real_time" }> {
  return mode.kind !== "real_time";
}

export function contingencyOf(mode: FiscalEmissionMode): Contingency | null {
  if (!isConnectivityGap(mode)) return null;
  const gateFailed = mode.kind === "deferring" && mode.reason === "pre_emission_gate_failed";
  return { kind: mode.kind, notice: !gateFailed };
}
