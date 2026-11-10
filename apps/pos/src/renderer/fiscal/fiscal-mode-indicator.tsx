import type { RegisterStatus } from "@purosur/contracts";
import { StatusPill } from "@purosur/ui";

export function FiscalModeIndicator({
  contingency,
}: {
  contingency: RegisterStatus["contingency"];
}) {
  if (contingency === null) return null;
  return (
    <StatusPill tone="warning">
      {contingency.kind === "offline_code" ? "Contingencia CAEA" : "Venta diferida"}
    </StatusPill>
  );
}
