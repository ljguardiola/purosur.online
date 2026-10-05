import { Button, formatCents, HighlightedNotice } from "@purosur/ui";
import { ShoppingBasket } from "lucide-react";

export function OpenSaleBlock({ total, onGoToSale }: { total: number; onGoToSale: () => void }) {
  return (
    <HighlightedNotice
      tone="warning"
      icon={<ShoppingBasket />}
      title={`Hay una venta abierta de ${formatCents(total)}`}
      description="Cobrala o cancelala antes de cerrar la caja."
      actions={
        <Button icon={<ShoppingBasket />} onPress={onGoToSale}>
          Ir a la venta
        </Button>
      }
    />
  );
}
