import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { reportRegisterFieldOf } from "../shell/report-register-field";
import { ReturnsReportScreen } from "./returns-report-screen";
import { defaultReturnsReportScreenServices } from "./returns-report-services";

const route = getRouteApi("/signed-in/reports-area/reports/returns");

export function ReturnsReportPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Devoluciones · Puro Sur");
  return (
    <ReturnsReportScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      registerFilter={reportRegisterFieldOf({
        filter: services.reportFiltersRegisterFilter,
        services: services.reportRegisterFilter,
        onSessionEnded: sessionActions.sessionEnded,
      })}
      services={services.returnsReportScreen ?? defaultReturnsReportScreenServices}
    />
  );
}
