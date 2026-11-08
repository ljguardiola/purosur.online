import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { StockMovementsScreen } from "./stock-movements-screen";
import { defaultStockRecordsServices } from "./stock-movements-services";

const route = getRouteApi("/signed-in/stock-area/stock/movements");

export function StockMovementsPage(): ReactElement {
  const { services, session, sessionActions } = route.useRouteContext();
  const { search, reason, period, type, view, from, to } = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <StockMovementsScreen
      access={session}
      filters={{ search, reason, period, type, view, from, to }}
      onFiltersChange={(next) =>
        void navigate({ search: (current) => ({ ...current, ...next }), replace: true })
      }
      onSessionEnded={sessionActions.sessionEnded}
      services={{
        fetchStockMovements:
          services.stockMovementsScreen?.fetchStockMovements ??
          defaultStockRecordsServices.fetchStockMovements,
        fetchStockCounts:
          services.stockCountsScreen?.fetchStockCounts ??
          defaultStockRecordsServices.fetchStockCounts,
        fetchLossesByReasonReport:
          services.lossesByReasonReportScreen?.fetchLossesByReasonReport ??
          defaultStockRecordsServices.fetchLossesByReasonReport,
      }}
    />
  );
}
