import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { PurchasesReportScreen } from "./purchases-report-screen";
import { defaultPurchasesReportScreenServices } from "./purchases-report-services";

const route = getRouteApi("/signed-in/reports-area/reports/purchases-by-supplier");

export function PurchasesReportPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Compras por proveedor · Puro Sur");
  return (
    <PurchasesReportScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.purchasesReportScreen ?? defaultPurchasesReportScreenServices}
    />
  );
}
