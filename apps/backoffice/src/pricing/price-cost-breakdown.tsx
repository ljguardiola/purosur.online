import type { PriceProduct } from "@purosur/contracts";
import { Card, FigureStat, InlineNotice } from "@purosur/ui";
import { Info } from "lucide-react";
import { formatCentsWithUnit } from "./money";

export type PriceCostBreakdownProps = { product: PriceProduct };

export function PriceCostBreakdown({ product }: PriceCostBreakdownProps) {
  const { costReference, saleUnit } = product;
  const cost = (cents: number | undefined) =>
    cents === undefined ? "—" : formatCentsWithUnit(cents, saleUnit);

  return (
    <div className="flex flex-col gap-3">
      <Card variant="subtle">
        <div className="flex flex-wrap gap-6">
          <FigureStat
            label="Último costo"
            size="heading"
            value={cost(costReference?.lastCostCents)}
          />
          <FigureStat
            label="Flete por unidad"
            size="heading"
            value={cost(costReference?.freightPerUnitCents)}
          />
          <FigureStat
            label="Costo total"
            size="heading"
            value={cost(costReference?.totalCostCents)}
          />
        </div>
      </Card>
      {costReference === null ? (
        <InlineNotice
          tone="info"
          icon={<Info />}
          title="Sin costo registrado"
          description="El margen aparece cuando el producto tenga una compra o un costo de inventario inicial."
        />
      ) : null}
    </div>
  );
}
