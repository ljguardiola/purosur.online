import { Button, formatCents, Modal, SummaryRowGroup } from "@purosur/ui";
import { ArrowLeft, CircleX, X } from "lucide-react";

export type CancelSaleModalProps = {
  open: boolean;
  lineCount: number;
  total: number;
  busy: boolean;
  onClose: () => void;
  onCancelSale: () => void;
};

export function CancelSaleModal({
  open,
  lineCount,
  total,
  busy,
  onClose,
  onCancelSale,
}: CancelSaleModalProps) {
  return (
    <Modal
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          onClose();
        }
      }}
      width="confirmation"
      tone="error"
      icon={<CircleX />}
      context="Venta en curso · Sin pagos"
      title="¿Cancelar la venta?"
      closable
      footer={
        <>
          <Button variant="secondary" size="large" icon={<ArrowLeft />} onPress={onClose}>
            Seguir con la venta
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
        <SummaryRowGroup
          rows={[
            { label: "Líneas en el carrito", value: String(lineCount) },
            { label: "Total", value: formatCents(total), strong: true },
          ]}
        />
        <p className="text-body text-text">
          Se vacía el carrito y no se cobra nada. La mercadería no sale del stock.
        </p>
      </div>
    </Modal>
  );
}
