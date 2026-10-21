import type { RegisterStatus } from "@purosur/contracts";
import { StatusIndicator } from "@purosur/ui";
import { isInContingency } from "./fiscal-contingency";

export function FiscalModeIndicator({ mode }: { mode: RegisterStatus["fiscal_mode"] }) {
  return isInContingency(mode) ? (
    <StatusIndicator tone="warning">Contingencia CAEA</StatusIndicator>
  ) : null;
}
