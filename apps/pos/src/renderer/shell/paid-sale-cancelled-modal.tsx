import { Button, Modal } from "@purosur/ui";
import { Check, CircleCheck } from "lucide-react";
import type { Refund } from "./refund-lines";
import { RefundLines } from "./refund-lines";

export type PaidSaleCancelledModalProps = {
  refunds: readonly Refund[];
  onClose: () => void;
};

export function PaidSaleCancelledModal({ refunds, onClose }: PaidSaleCancelledModalProps) {
  return (
    <Modal
      open
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      width="confirmation"
      tone="success"
      icon={<CircleCheck />}
      title="Venta cancelada"
      closable
      footer={
        <Button size="large" fullWidth icon={<Check />} onPress={onClose}>
          Listo
        </Button>
      }
    >
      <RefundLines refunds={refunds} />
    </Modal>
  );
}
