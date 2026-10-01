import { Button, formatCents, Modal, SummaryRowGroup } from "@purosur/ui";
import { CircleCheck, Plus } from "lucide-react";
import { Eyebrow } from "../shell/eyebrow";

export type SaleCompletedModalProps = {
  total: number;
  tendered: number;
  change: number;
  onNewSale: () => void;
};

export function SaleCompletedModal({
  total,
  tendered,
  change,
  onNewSale,
}: SaleCompletedModalProps) {
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
        {change > 0 ? (
          <div className="flex flex-col gap-1">
            <Eyebrow text="VUELTO" />
            <p className="text-display text-text-accent">{formatCents(change)}</p>
          </div>
        ) : null}
        <SummaryRowGroup
          rows={[
            { label: "Total", value: formatCents(total) },
            { label: "Efectivo entregado", value: formatCents(tendered) },
          ]}
        />
      </div>
    </Modal>
  );
}
