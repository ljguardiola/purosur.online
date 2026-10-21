import type { RegisterStatus } from "@purosur/contracts";

export function isInContingency(mode: RegisterStatus["fiscal_mode"]): boolean {
  return mode === "offline_code";
}
