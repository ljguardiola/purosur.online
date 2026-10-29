import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { FreightReportScreen } from "./freight-report-screen";
import { defaultFreightReportScreenServices } from "./freight-report-services";

const route = getRouteApi("/signed-in/reports-area/reports/freight-by-period");

export function FreightReportPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Flete por período · Puro Sur");
  return (
    <FreightReportScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.freightReportScreen ?? defaultFreightReportScreenServices}
    />
  );
}
