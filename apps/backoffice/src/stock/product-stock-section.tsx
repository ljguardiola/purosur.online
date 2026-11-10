import { EmptyState, LoadFailure, LoadingPlaceholder, SummaryRowGroup } from "@purosur/ui";
import { Boxes } from "lucide-react";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import type { ProductPanelSectionProps } from "../platform/product-panel-sections";
import { formatStockQuantity } from "../platform/stock-quantity";
import { fetchStockBalances } from "./stock-api";
import { StockBalanceLots } from "./stock-balance-lots";
import type { StockBalancesReader } from "./stock-balances-services";
import { formatStockUnitCost, formatStockValue } from "./stock-cost";
import { useStockBalancesQuery } from "./stock-queries";

export type ProductStockSectionProps = ProductPanelSectionProps & {
  services?: StockBalancesReader | undefined;
};

export function ProductStockSection({
  productId,
  saleUnit,
  onSessionEnded,
  services = { fetchStockBalances },
}: ProductStockSectionProps) {
  const data = useStockBalancesQuery({
    fetchStockBalances: services.fetchStockBalances,
    onSessionEnded,
  });

  if (data.status === "loading") {
    return <LoadingPlaceholder variant="rows" rows={3} />;
  }
  if (data.status === "failed") {
    return <LoadFailure {...cloudLoadFailure(data, "el stock")} />;
  }
  const balance = data.value.products.find((product) => product.id === productId);
  if (balance === undefined) {
    return (
      <EmptyState
        icon={<Boxes />}
        title="Sin stock registrado"
        description="El producto aparece acá cuando tenga una compra, una producción o un recuento."
        variant="blank"
      />
    );
  }

  return (
    <div className="flex flex-col gap-4 pt-4">
      <SummaryRowGroup
        variant="filled"
        rows={[
          { label: "Saldo", value: formatStockQuantity(balance.balance, saleUnit) },
          { label: "Costo unitario", value: formatStockUnitCost(balance.unitCostCents, saleUnit) },
          { label: "Valorizado", value: formatStockValue(balance.valueCents) },
        ]}
      />
      {balance.lots.length === 0 ? null : <StockBalanceLots product={balance} />}
    </div>
  );
}
