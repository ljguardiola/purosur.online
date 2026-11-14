import { Button, formatCents, HighlightedNotice } from "@purosur/ui";
import { ShoppingBasket } from "lucide-react";
import { useKeys } from "../platform/key-layer";

export function OpenSaleBlock({ total, onGoToSale }: { total: number; onGoToSale: () => void }) {
  useKeys([{ key: "V", run: onGoToSale, whileTyping: true }]);
  return (
    <HighlightedNotice
      tone="warning"
      layout="row"
      icon={<ShoppingBasket />}
      title={`Hay una venta abierta de ${formatCents(total)}`}
      description="Terminala antes de cerrar la caja."
      actions={
        <Button variant="text" keycap="V" onPress={onGoToSale}>
          Ir a la venta
        </Button>
      }
    />
  );
}
