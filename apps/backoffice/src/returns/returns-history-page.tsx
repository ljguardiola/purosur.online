import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { reportRegisterFieldOf } from "../shell/report-register-field";
import { ReturnsHistoryScreen } from "./returns-history-screen";
import { defaultReturnsHistoryScreenServices } from "./returns-history-services";

const route = getRouteApi("/signed-in/sales-and-cash-area/refunds/history");

export function ReturnsHistoryPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <ReturnsHistoryScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      registerFilter={reportRegisterFieldOf({
        filter: services.reportFiltersRegisterFilter,
        services: services.reportRegisterFilter,
        onSessionEnded: sessionActions.sessionEnded,
      })}
      services={services.returnsHistoryScreen ?? defaultReturnsHistoryScreenServices}
    />
  );
}
