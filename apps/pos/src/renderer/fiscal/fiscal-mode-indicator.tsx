import type { RegisterStatus } from "@purosur/contracts";
import { StatusIndicator } from "@purosur/ui";

export function FiscalModeIndicator({
  contingency,
}: {
  contingency: RegisterStatus["contingency"];
}) {
  if (contingency === null) return null;
  return (
    <StatusIndicator tone="warning">
      {contingency.kind === "offline_code" ? "Contingencia CAEA" : "Venta diferida"}
    </StatusIndicator>
  );
}
