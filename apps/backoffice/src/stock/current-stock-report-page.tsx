import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { CurrentStockReportScreen } from "./current-stock-report-screen";
import { defaultCurrentStockReportScreenServices } from "./current-stock-report-services";

const route = getRouteApi("/signed-in/reports-area/reports/current-stock");

export function CurrentStockReportPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Stock actual valorizado · Puro Sur");
  return (
    <CurrentStockReportScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.currentStockReportScreen ?? defaultCurrentStockReportScreenServices}
    />
  );
}
