import type { StockBalance } from "@purosur/contracts";
import { DetailPanel, SummaryRowGroup } from "@purosur/ui";
import { formatProductDescription } from "@purosur/ui/formatters";
import { formatStockQuantity } from "../platform/stock-quantity";
import {
  type BackofficeAccess,
  canPerformStockCounts,
  canSeeStockMovements,
} from "../shell/backoffice-access";
import { StockBalanceLots } from "./stock-balance-lots";
import { StockBalanceMovements } from "./stock-balance-movements";
import type { StockBalancesScreenServices } from "./stock-balances-services";
import { formatStockUnitCost, formatStockValue } from "./stock-cost";

export type StockBalancePanelProps = {
  product: StockBalance;
  access: BackofficeAccess;
  services: StockBalancesScreenServices;
  onClose: () => void;
  onSessionEnded: () => void;
};

export function StockBalancePanel({
  product,
  access,
  services,
  onClose,
  onSessionEnded,
}: StockBalancePanelProps) {
  const name = formatProductDescription(product);
  return (
    <DetailPanel open onClose={onClose} recordKey={product.id} title={name}>
      <div className="flex flex-col gap-4 pt-4">
        <SummaryRowGroup
          variant="filled"
          rows={[
            { label: "Saldo", value: formatStockQuantity(product.balance, product.saleUnit) },
            {
              label: "Costo unitario",
              value: formatStockUnitCost(product.unitCostCents, product.saleUnit),
            },
            { label: "Valorizado", value: formatStockValue(product.valueCents) },
          ]}
        />
        {product.lots.length === 0 ? null : <StockBalanceLots product={product} />}
        <StockBalanceMovements
          productId={product.id}
          productName={name}
          services={services}
          showsCounts={canPerformStockCounts(access)}
          showsMovements={canSeeStockMovements(access)}
          onSessionEnded={onSessionEnded}
        />
      </div>
    </DetailPanel>
  );
}
