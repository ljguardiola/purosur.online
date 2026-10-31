import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { reportRegisterFieldOf } from "../shell/report-register-field";
import { MarginReportScreen } from "./margin-report-screen";
import { defaultMarginReportScreenServices } from "./margin-report-services";

const route = getRouteApi("/signed-in/reports-area/reports/margin");

export function MarginReportPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Margen por producto y por categoría · Puro Sur");
  return (
    <MarginReportScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      registerFilter={reportRegisterFieldOf({
        filter: services.reportFiltersRegisterFilter,
        services: services.reportRegisterFilter,
        onSessionEnded: sessionActions.sessionEnded,
      })}
      services={services.marginReportScreen ?? defaultMarginReportScreenServices}
    />
  );
}
