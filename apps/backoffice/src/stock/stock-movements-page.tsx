import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { StockMovementsScreen } from "./stock-movements-screen";
import { defaultStockMovementsScreenServices } from "./stock-movements-services";

const route = getRouteApi("/signed-in/stock-area/stock/movements");

export function StockMovementsPage(): ReactElement {
  const { services, session, sessionActions } = route.useRouteContext();
  const { search, reason, period } = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <StockMovementsScreen
      access={session}
      productCreationModal={services.productCreationModal}
      filters={{ search, reason, period }}
      onFiltersChange={(next) =>
        void navigate({ search: (current) => ({ ...current, ...next }), replace: true })
      }
      onSessionEnded={sessionActions.sessionEnded}
      services={services.stockMovementsScreen ?? defaultStockMovementsScreenServices}
    />
  );
}
