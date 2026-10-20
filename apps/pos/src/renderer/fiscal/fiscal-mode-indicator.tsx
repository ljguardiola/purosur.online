import type { RegisterStatus } from "@purosur/contracts";
import { NotificationCard, StatusIndicator } from "@purosur/ui";
import { Receipt } from "lucide-react";

type FiscalMode = RegisterStatus["fiscal_mode"];

export function isInContingency(mode: FiscalMode): boolean {
  return mode === "offline_code";
}

export function FiscalModeIndicator({ mode }: { mode: FiscalMode }) {
  if (mode === "real_time") {
    return <StatusIndicator tone="success">Factura en línea</StatusIndicator>;
  }
  if (mode === "offline_code") {
    return <StatusIndicator tone="warning">Contingencia CAEA</StatusIndicator>;
  }
  return null;
}

export function ContingencyNoticeCard() {
  return (
    <NotificationCard
      tone="warning"
      icon={<Receipt />}
      title="Facturación en modo de respaldo"
      description="La caja no puede pedir la autorización de cada factura en el momento y factura con su respaldo."
      whatToDo="Seguí vendiendo con normalidad: las facturas salen igual. Se resuelve sola."
    />
  );
}
