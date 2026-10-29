import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { reportRegisterFieldOf } from "../shell/report-register-field";
import { RemovedLinesAndCancelledSalesScreen } from "./removed-lines-and-cancelled-sales-screen";
import { defaultRemovedLinesAndCancelledSalesScreenServices } from "./removed-lines-and-cancelled-sales-services";

const route = getRouteApi("/signed-in/reports-area/reports/removed-lines-and-cancelled-sales");

export function RemovedLinesAndCancelledSalesPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Líneas quitadas y ventas canceladas · Puro Sur");
  return (
    <RemovedLinesAndCancelledSalesScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      registerFilter={reportRegisterFieldOf({
        filter: services.reportFiltersRegisterFilter,
        services: services.reportRegisterFilter,
        onSessionEnded: sessionActions.sessionEnded,
      })}
      services={
        services.removedLinesAndCancelledSalesScreen ??
        defaultRemovedLinesAndCancelledSalesScreenServices
      }
    />
  );
}
