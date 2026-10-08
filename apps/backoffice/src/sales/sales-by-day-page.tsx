import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { SalesByDayScreen } from "./sales-by-day-screen";

const route = getRouteApi("/signed-in/reports-area/reports/sales-by-day");

export function SalesByDayPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Ventas por día o por rango · Puro Sur");
  return (
    <SalesByDayScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.salesByDayScreen}
    />
  );
}
