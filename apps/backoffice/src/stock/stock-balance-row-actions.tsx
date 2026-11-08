import type { StockBalance } from "@purosur/contracts";
import type { RowMenuAction } from "@purosur/ui";
import { ArrowDownUp, ClipboardCheck, PackageX } from "lucide-react";
import { type BackofficeAccess, canPerformStockCounts } from "../shell/backoffice-access";

export type StockBalanceActions = {
  count: (product: StockBalance) => void;
  adjust: (product: StockBalance) => void;
  registerLoss: (product: StockBalance) => void;
};

export function stockBalanceRowActions(access: BackofficeAccess, actions: StockBalanceActions) {
  function menu(product: StockBalance) {
    const entries: RowMenuAction[] = [];
    if (canPerformStockCounts(access)) {
      entries.push({
        label: "Contar",
        icon: <ClipboardCheck />,
        onAction: () => actions.count(product),
      });
    }
    if (access.stockMovementKinds.includes("adjustment")) {
      entries.push({
        label: "Ajustar",
        icon: <ArrowDownUp />,
        onAction: () => actions.adjust(product),
      });
    }
    if (access.stockMovementKinds.includes("loss")) {
      entries.push({
        label: "Registrar pérdida",
        icon: <PackageX />,
        onAction: () => actions.registerLoss(product),
      });
    }
    const [first, ...others] = entries;
    return first === undefined ? undefined : ([first, ...others] as const);
  }

  return { actions: [] as const, menu };
}
