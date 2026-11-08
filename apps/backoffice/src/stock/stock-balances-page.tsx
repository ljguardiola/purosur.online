import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { StockBalancesScreen } from "./stock-balances-screen";
import { defaultStockBalancesScreenServices } from "./stock-balances-services";

const route = getRouteApi("/signed-in/stock-area/stock/");

export function StockBalancesPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const { search, category, balance, sortBy, sort } = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <StockBalancesScreen
      filters={{ search, category, balance, sortBy, sort }}
      onFiltersChange={(next) =>
        void navigate({ search: (current) => ({ ...current, ...next }), replace: true })
      }
      onSessionEnded={sessionActions.sessionEnded}
      services={services.stockBalancesScreen ?? defaultStockBalancesScreenServices}
    />
  );
}
