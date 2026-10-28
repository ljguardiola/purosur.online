import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { reportRegisterFieldOf } from "../shell/report-register-field";
import { CashMovementsScreen } from "./cash-movements-screen";
import { defaultCashMovementsScreenServices } from "./cash-movements-services";

const route = getRouteApi("/signed-in/reports-area/reports/cash-movements");

export function CashMovementsPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Movimientos de caja · Puro Sur");
  return (
    <CashMovementsScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      registerFilter={reportRegisterFieldOf({
        filter: services.reportFiltersRegisterFilter,
        services: services.reportRegisterFilter,
        onSessionEnded: sessionActions.sessionEnded,
      })}
      services={services.cashMovementsScreen ?? defaultCashMovementsScreenServices}
    />
  );
}
