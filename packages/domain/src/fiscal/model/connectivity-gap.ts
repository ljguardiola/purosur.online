import type { FiscalEmissionMode } from "./fiscal-emission-mode.js";

export function isConnectivityGap(mode: FiscalEmissionMode): boolean {
  return mode.kind !== "real_time";
}
