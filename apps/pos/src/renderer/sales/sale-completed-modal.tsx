import { Button, FigureStat, formatCents, Modal, SummaryRowGroup } from "@purosur/ui";
import { CircleCheck, Plus } from "lucide-react";

export type SaleCompletedModalProps = {
  total: number;
  onNewSale: () => void;
} & (
  | { tendered: number; change: number; method?: "CASH" }
  | { method: "TRANSFER"; amount: number }
);

export function SaleCompletedModal(props: SaleCompletedModalProps) {
  const { total, onNewSale } = props;
  const change = props.method === "TRANSFER" ? 0 : props.change;
  const paymentRow =
    props.method === "TRANSFER"
      ? { label: "Transferencia", value: formatCents(props.amount) }
      : { label: "Efectivo entregado", value: formatCents(props.tendered) };
  return (
    <Modal
      open
      onOpenChange={() => {}}
      width="standard"
      tone="success"
      icon={<CircleCheck />}
      context="VENTA COMPLETADA"
      contextTone="success"
      title={change > 0 ? "Entregá el vuelto" : "No hay vuelto para entregar"}
      footer={
        <Button size="large" fullWidth icon={<Plus />} onPress={onNewSale}>
          Nueva venta
        </Button>
      }
    >
      <div className="flex flex-col gap-5">
        {change > 0 ? <FigureStat label="VUELTO" value={formatCents(change)} /> : null}
        <SummaryRowGroup rows={[{ label: "Total", value: formatCents(total) }, paymentRow]} />
      </div>
    </Modal>
  );
}
