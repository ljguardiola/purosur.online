import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { StockBalancesScreen } from "./stock-balances-screen";

const route = getRouteApi("/signed-in/stock-area/inventory");

export function StockBalancesPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Saldos · Puro Sur");
  return (
    <StockBalancesScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.stockBalancesScreen}
    />
  );
}
