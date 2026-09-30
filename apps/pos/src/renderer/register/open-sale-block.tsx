import { Button, formatCents } from "@purosur/ui";
import { ShoppingBasket } from "lucide-react";

export function OpenSaleBlock({ total, onGoToSale }: { total: number; onGoToSale: () => void }) {
  return (
    <section className="flex flex-col items-start gap-3 rounded-lg bg-warning-subtle p-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-subheading font-bold text-text">
          {`Hay una venta abierta de ${formatCents(total)}`}
        </h2>
        <p className="text-body text-text-subtle">Cobrala o cancelala antes de cerrar la caja.</p>
      </div>
      <Button icon={<ShoppingBasket />} onPress={onGoToSale}>
        Ir a la venta
      </Button>
    </section>
  );
}
