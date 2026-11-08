import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { StockBalancesScreen } from "./stock-balances-screen";
import { defaultStockBalancesScreenServices } from "./stock-balances-services";

const route = getRouteApi("/signed-in/stock-area/stock/");

export function StockBalancesPage(): ReactElement {
  const { services, session, sessionActions } = route.useRouteContext();
  const { search, category, balance, sortBy, sort, product } = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <StockBalancesScreen
      access={session}
      productCreationModal={services.productCreationModal}
      filters={{ search, category, balance, sortBy, sort }}
      onFiltersChange={(next) =>
        void navigate({ search: (current) => ({ ...current, ...next }), replace: true })
      }
      openProduct={product}
      onOpenProductChange={(opened) =>
        void navigate({
          search: (current) => ({ ...current, product: opened }),
          ...(opened === undefined ? { replace: true } : {}),
        })
      }
      onSessionEnded={sessionActions.sessionEnded}
      services={services.stockBalancesScreen ?? defaultStockBalancesScreenServices}
    />
  );
}
