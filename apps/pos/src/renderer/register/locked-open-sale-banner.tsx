import { Button, formatCents, HighlightedNotice } from "@purosur/ui";
import { ShoppingBasket } from "lucide-react";
import { useKeys } from "../platform/key-layer";

export type LockedOpenSaleBannerProps = {
  total: number;
  hasApprovedPayment: boolean;
  onCancel: () => void;
};

export function LockedOpenSaleBanner({
  total,
  hasApprovedPayment,
  onCancel,
}: LockedOpenSaleBannerProps) {
  useKeys([{ key: "V", run: onCancel, whileTyping: true }]);

  return (
    <HighlightedNotice
      tone="warning"
      layout="row"
      icon={<ShoppingBasket />}
      title={`Hay una venta abierta de ${formatCents(total)}`}
      description={
        hasApprovedPayment
          ? "Cancelala para cerrar la caja."
          : "Vaciá la venta para cerrar la caja."
      }
      actions={
        <Button variant="text" keycap="V" onPress={onCancel}>
          {hasApprovedPayment ? "Cancelar la venta" : "Vaciar venta"}
        </Button>
      }
    />
  );
}
