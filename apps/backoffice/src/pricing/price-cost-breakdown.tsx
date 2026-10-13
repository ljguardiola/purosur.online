import type { PriceProduct } from "@purosur/contracts";
import type { SaleUnit } from "@purosur/domain";
import { Card, EmptyState, FigureStat } from "@purosur/ui";
import { Receipt } from "lucide-react";
import { formatCentsWithUnit } from "./money";

const FREIGHT_LABEL = {
  UNIT: "Flete por unidad",
  KG: "Flete por kilo",
} satisfies Record<SaleUnit, string>;

export type PriceCostBreakdownProps = { product: PriceProduct };

export function PriceCostBreakdown({ product }: PriceCostBreakdownProps) {
  const { costReference, saleUnit } = product;

  if (costReference === null) {
    return (
      <EmptyState
        icon={<Receipt />}
        title="Sin costo registrado"
        description="El margen aparece cuando el producto tenga una compra o un costo de inventario inicial."
        variant="blank"
      />
    );
  }

  return (
    <Card variant="subtle">
      <div className="flex flex-wrap gap-6">
        <FigureStat
          label="Último costo"
          size="heading"
          value={formatCentsWithUnit(costReference.lastCostCents, saleUnit)}
        />
        <FigureStat
          label={FREIGHT_LABEL[saleUnit]}
          size="heading"
          value={formatCentsWithUnit(costReference.freightPerUnitCents, saleUnit)}
        />
        <FigureStat
          label="Costo total"
          size="heading"
          value={formatCentsWithUnit(costReference.totalCostCents, saleUnit)}
        />
      </div>
    </Card>
  );
}
