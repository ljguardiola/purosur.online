import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { StockMovementsScreen } from "./stock-movements-screen";

const route = getRouteApi("/signed-in/stock/adjustments-and-losses");

export function StockMovementsPage(): ReactElement {
  const { services, session, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Ajustes y pérdidas · Puro Sur");
  return (
    <StockMovementsScreen
      access={session}
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.stockMovementsScreen}
    />
  );
}
