import type { FiscalEmissionMode } from "./fiscal-emission-mode.js";

export function countsAsContingencyTime(mode: FiscalEmissionMode): boolean {
  return mode.kind === "offline_code" && mode.cause === "no_connectivity";
}
