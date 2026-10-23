import type { RegisterStatus } from "@purosur/contracts";
import { NotificationCard } from "@purosur/ui";
import { Receipt } from "lucide-react";

type ContingencyKind = NonNullable<RegisterStatus["contingency"]>["kind"];

const TEXTS: Record<ContingencyKind, { title: string; description: string; whatToDo: string }> = {
  offline_code: {
    title: "Facturación en modo de respaldo",
    description:
      "La caja no puede pedir la autorización de cada factura en el momento y factura con su respaldo.",
    whatToDo: "Seguí vendiendo con normalidad: las facturas salen igual. Se resuelve sola.",
  },
  deferring: {
    title: "Ventas sin factura en el momento",
    description:
      "Esta caja no puede emitir la factura de cada venta en el momento, ni siquiera con su respaldo.",
    whatToDo:
      "Seguir vendiendo: se cobra, se entrega al cliente el papel que dice que todavía no es la factura, y la factura se emite sola más adelante. Guardar los tickets de respaldo en la caja del local.",
  },
};

export function ContingencyNoticeCard({ kind }: { kind: ContingencyKind }) {
  const text = TEXTS[kind];
  return (
    <NotificationCard
      tone="warning"
      icon={<Receipt />}
      title={text.title}
      description={text.description}
      whatToDo={text.whatToDo}
    />
  );
}
