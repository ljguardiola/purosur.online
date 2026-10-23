import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { reportRegisterFieldOf } from "../shell/report-register-field";
import { CashSessionClosesScreen } from "./cash-session-closes-screen";
import { defaultCashSessionClosesScreenServices } from "./cash-session-closes-services";

const route = getRouteApi("/signed-in/reports-area/reports/cash-session-closes");

export function CashSessionClosesPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Cierres de sesión · Puro Sur");
  return (
    <CashSessionClosesScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      registerFilter={reportRegisterFieldOf({
        filter: services.reportFiltersRegisterFilter,
        services: services.reportRegisterFilter,
        onSessionEnded: sessionActions.sessionEnded,
      })}
      services={services.cashSessionClosesScreen ?? defaultCashSessionClosesScreenServices}
    />
  );
}
