import type { StockProduct } from "@purosur/contracts";
import { LoadFailure, LoadingPlaceholder, SummaryRowGroup } from "@purosur/ui";
import { cloudLoadFailure } from "../platform/cloud-load-failure";
import type { StockMovementsScreenServices } from "./stock-movements-services";
import { formatStockChange, formatStockQuantity } from "./stock-quantity";
import { useStockBalancesQuery } from "./stock-queries";

export function StockBalanceChange({
  product,
  delta,
  services,
  onSessionEnded,
}: {
  product: StockProduct;
  delta: number | undefined;
  services: StockMovementsScreenServices;
  onSessionEnded: () => void;
}) {
  const balances = useStockBalancesQuery({
    fetchStockBalances: services.fetchStockBalances,
    onSessionEnded,
  });
  if (balances.status === "loading") {
    return <LoadingPlaceholder variant="card" lines={3} />;
  }
  if (balances.status === "failed") {
    return <LoadFailure {...cloudLoadFailure(balances, "el saldo")} />;
  }
  const balance = balances.value.products.find((listed) => listed.id === product.id)?.balance ?? 0;
  const current = {
    label: "Saldo actual",
    value: formatStockQuantity(balance, product.saleUnit),
  };
  return (
    <SummaryRowGroup
      rows={
        delta === undefined
          ? [current]
          : [
              current,
              { label: "Cambio", value: formatStockChange(delta, product.saleUnit) },
              {
                label: "Saldo después",
                value: formatStockQuantity(balance + delta, product.saleUnit),
                strong: true,
              },
            ]
      }
    />
  );
}
