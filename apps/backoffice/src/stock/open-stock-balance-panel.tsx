import type { StockBalance } from "@purosur/contracts";
import { useEffect, useEffectEvent } from "react";
import type { BackofficeAccess } from "../shell/backoffice-access";
import { StockBalancePanel } from "./stock-balance-panel";
import type { StockBalancesScreenServices } from "./stock-balances-services";

export type OpenStockBalancePanelProps = {
  products: readonly StockBalance[];
  productsAreLoaded: boolean;
  openProduct: string | undefined;
  access: BackofficeAccess;
  services: StockBalancesScreenServices;
  onClose: () => void;
  onSessionEnded: () => void;
};

export function OpenStockBalancePanel({
  products,
  productsAreLoaded,
  openProduct,
  access,
  services,
  onClose,
  onSessionEnded,
}: OpenStockBalancePanelProps) {
  const product = products.find((candidate) => candidate.id === openProduct);
  const closeUnlisted = useEffectEvent(onClose);
  useEffect(() => {
    if (productsAreLoaded && openProduct !== undefined && product === undefined) {
      closeUnlisted();
    }
  }, [productsAreLoaded, openProduct, product]);

  if (product === undefined) {
    return null;
  }
  return (
    <StockBalancePanel
      key={product.id}
      product={product}
      access={access}
      services={services}
      onClose={onClose}
      onSessionEnded={onSessionEnded}
    />
  );
}
