import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { reportRegisterFieldOf } from "../shell/report-register-field";
import { ManualDiscountsScreen } from "./manual-discounts-screen";
import { defaultManualDiscountsScreenServices } from "./manual-discounts-services";

const route = getRouteApi("/signed-in/reports-area/reports/manual-discounts");

export function ManualDiscountsPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Descuentos manuales y sobre el total · Puro Sur");
  return (
    <ManualDiscountsScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      registerFilter={reportRegisterFieldOf({
        filter: services.reportFiltersRegisterFilter,
        services: services.reportRegisterFilter,
        onSessionEnded: sessionActions.sessionEnded,
      })}
      services={services.manualDiscountsScreen ?? defaultManualDiscountsScreenServices}
    />
  );
}
