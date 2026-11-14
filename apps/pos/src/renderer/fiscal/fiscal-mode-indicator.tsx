import type { RegisterStatus } from "@purosur/contracts";
import { StatusPill } from "@purosur/ui";
import { fiscalModeText } from "./fiscal-mode-text";

export function FiscalModeIndicator({
  contingency,
}: {
  contingency: RegisterStatus["contingency"];
}) {
  if (contingency === null) return null;
  return <StatusPill tone="warning">{fiscalModeText(contingency.kind)}</StatusPill>;
}
