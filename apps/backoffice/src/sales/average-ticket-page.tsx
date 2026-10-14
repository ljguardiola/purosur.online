import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { reportRegisterFieldOf } from "../shell/report-register-field";
import { AverageTicketScreen } from "./average-ticket-screen";
import { defaultAverageTicketScreenServices } from "./average-ticket-services";

const route = getRouteApi("/signed-in/reports-area/reports/average-ticket");

export function AverageTicketPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Ticket promedio · Puro Sur");
  return (
    <AverageTicketScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      registerFilter={reportRegisterFieldOf({
        filter: services.reportFiltersRegisterFilter,
        services: services.reportRegisterFilter,
        onSessionEnded: sessionActions.sessionEnded,
      })}
      services={services.averageTicketScreen ?? defaultAverageTicketScreenServices}
    />
  );
}
