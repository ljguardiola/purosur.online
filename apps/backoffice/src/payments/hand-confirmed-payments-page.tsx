import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { reportRegisterFieldOf } from "../shell/report-register-field";
import { HandConfirmedPaymentsScreen } from "./hand-confirmed-payments-screen";
import { defaultHandConfirmedPaymentsScreenServices } from "./hand-confirmed-payments-services";

const route = getRouteApi("/signed-in/reports-area/reports/hand-confirmed-payments");

export function HandConfirmedPaymentsPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Pagos confirmados a mano · Puro Sur");
  return (
    <HandConfirmedPaymentsScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      registerFilter={reportRegisterFieldOf({
        filter: services.reportFiltersRegisterFilter,
        services: services.reportRegisterFilter,
        onSessionEnded: sessionActions.sessionEnded,
      })}
      services={services.handConfirmedPaymentsScreen ?? defaultHandConfirmedPaymentsScreenServices}
    />
  );
}
