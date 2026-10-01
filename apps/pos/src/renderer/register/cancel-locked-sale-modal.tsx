import { Button, formatCents, Modal, SummaryRowGroup } from "@purosur/ui";
import { ArrowLeft, CircleX, X } from "lucide-react";

export type CancelLockedSaleModalProps = {
  open: boolean;
  total: number;
  busy: boolean;
  onClose: () => void;
  onCancelSale: () => void;
};

export function CancelLockedSaleModal({
  open,
  total,
  busy,
  onClose,
  onCancelSale,
}: CancelLockedSaleModalProps) {
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next && !busy) {
          onClose();
        }
      }}
      width="confirmation"
      tone="error"
      icon={<CircleX />}
      context="Venta abierta · Sin pagos"
      title="¿Cancelar la venta?"
      closable
      footer={
        <>
          <Button
            variant="secondary"
            size="large"
            icon={<ArrowLeft />}
            disabled={busy}
            onPress={onClose}
          >
            Volver
          </Button>
          <Button
            destructive
            size="large"
            icon={<X />}
            fullWidth
            disabled={busy}
            onPress={onCancelSale}
          >
            Cancelar la venta
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <SummaryRowGroup rows={[{ label: "Total", value: formatCents(total), strong: true }]} />
        <p className="text-body text-text">
          Se vacía el carrito y no se cobra nada. La mercadería no sale del stock.
        </p>
      </div>
    </Modal>
  );
}
