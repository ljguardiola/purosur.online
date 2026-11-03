import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { reportRegisterFieldOf } from "../shell/report-register-field";
import { CashRoundingScreen } from "./cash-rounding-screen";
import { defaultCashRoundingScreenServices } from "./cash-rounding-services";

const route = getRouteApi("/signed-in/reports-area/reports/cash-rounding");

export function CashRoundingPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Redondeo en efectivo · Puro Sur");
  return (
    <CashRoundingScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      registerFilter={reportRegisterFieldOf({
        filter: services.reportFiltersRegisterFilter,
        services: services.reportRegisterFilter,
        onSessionEnded: sessionActions.sessionEnded,
      })}
      services={services.cashRoundingScreen ?? defaultCashRoundingScreenServices}
    />
  );
}
