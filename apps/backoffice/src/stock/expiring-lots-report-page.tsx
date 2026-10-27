import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { ExpiringLotsReportScreen } from "./expiring-lots-report-screen";
import { defaultExpiringLotsReportScreenServices } from "./expiring-lots-report-services";

const route = getRouteApi("/signed-in/reports-area/reports/expiring-lots");

export function ExpiringLotsReportPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Lotes por vencer · Puro Sur");
  return (
    <ExpiringLotsReportScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.expiringLotsReportScreen ?? defaultExpiringLotsReportScreenServices}
    />
  );
}
