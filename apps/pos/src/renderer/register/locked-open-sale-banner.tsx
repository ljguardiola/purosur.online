import { Button, formatCents, HighlightedNotice } from "@purosur/ui";
import { ShoppingBasket } from "lucide-react";
import { useKeys } from "../platform/key-layer";

export type LockedOpenSaleBannerProps = {
  total: number;
  hasApprovedPayment: boolean;
  disabled: boolean;
  onCancel: () => void;
};

export function LockedOpenSaleBanner({
  total,
  hasApprovedPayment,
  disabled,
  onCancel,
}: LockedOpenSaleBannerProps) {
  useKeys([{ key: "V", run: onCancel, enabled: !disabled, whileTyping: true }]);

  return (
    <HighlightedNotice
      tone="warning"
      layout="row"
      icon={<ShoppingBasket />}
      title={`Hay una venta abierta de ${formatCents(total)}`}
      description={
        hasApprovedPayment
          ? "Cancelala para cerrar la caja."
          : "Vaciá el carrito para cerrar la caja."
      }
      actions={
        <Button variant="text" keycap="V" disabled={disabled} onPress={onCancel}>
          {hasApprovedPayment ? "Cancelar la venta" : "Vaciar carrito"}
        </Button>
      }
    />
  );
}
