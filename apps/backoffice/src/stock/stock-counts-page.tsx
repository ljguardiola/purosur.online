import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { StockCountsScreen } from "./stock-counts-screen";

const route = getRouteApi("/signed-in/stock-area/inventory-counts");

export function StockCountsPage(): ReactElement {
  const { services, session, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Recuentos · Puro Sur");
  return (
    <StockCountsScreen
      access={session}
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.stockCountsScreen}
    />
  );
}
