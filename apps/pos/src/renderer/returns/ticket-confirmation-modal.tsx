import type { SummaryRowProps } from "@purosur/ui";
import {
  Button,
  formatCents,
  formatDayAndTime,
  formatInvoiceNumber,
  formatPointOfSaleNumber,
  Modal,
  plural,
  SummaryRowGroup,
} from "@purosur/ui";
import { ArrowRight, ReceiptText, X } from "lucide-react";
import type { SaleForReturn } from "./return-sale";

export type TicketConfirmationModalProps = {
  sale: SaleForReturn;
  registerName: string | null;
  onConfirm: () => void;
  onReject: () => void;
};

function detailRows(
  sale: SaleForReturn,
  registerName: string | null,
): readonly [SummaryRowProps, ...SummaryRowProps[]] {
  const lines = sale.lines.length;
  const products: SummaryRowProps = {
    label: "Productos",
    value: `${lines} ${plural(lines, { one: "línea", other: "líneas" })}`,
  };
  const [first = products, ...others] = [
    ...(sale.invoice === null
      ? []
      : [
          {
            label: "Comprobante",
            value: `Factura C · PV ${formatPointOfSaleNumber(sale.invoice.point_of_sale)} · N° ${formatInvoiceNumber(sale.invoice.number)}`,
          },
        ]),
    ...(registerName === null ? [] : [{ label: "Caja", value: registerName }]),
    products,
  ];
  return [first, ...others];
}

export function TicketConfirmationModal({
  sale,
  registerName,
  onConfirm,
  onReject,
}: TicketConfirmationModalProps) {
  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) {
          onReject();
        }
      }}
      width="confirmation"
      closable
      tone="info"
      icon={<ReceiptText />}
      context="VENTA ENCONTRADA"
      title="¿Coincide con el ticket en papel?"
      footer={
        <>
          <Button variant="secondary" size="large" icon={<X />} onPress={onReject}>
            No coincide
          </Button>
          <Button size="large" icon={<ArrowRight />} fullWidth onPress={onConfirm}>
            Coincide: seguir
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-5">
        <SummaryRowGroup
          variant="filled"
          orientation="horizontal"
          rows={[
            { label: "Fecha", value: formatDayAndTime(sale.occurred_at) },
            { label: "Total", value: formatCents(sale.total) },
          ]}
        />
        <SummaryRowGroup variant="plain" rows={detailRows(sale, registerName)} />
      </div>
    </Modal>
  );
}
