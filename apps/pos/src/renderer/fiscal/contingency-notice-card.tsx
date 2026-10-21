import { NotificationCard } from "@purosur/ui";
import { Receipt } from "lucide-react";

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
