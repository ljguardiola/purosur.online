import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { reportRegisterFieldOf } from "../shell/report-register-field";
import { SalesByCashierScreen } from "./sales-by-cashier-screen";
import { defaultSalesByCashierScreenServices } from "./sales-by-cashier-services";

const route = getRouteApi("/signed-in/reports-area/reports/sales-by-cashier");

export function SalesByCashierPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Ventas por cajero · Puro Sur");
  return (
    <SalesByCashierScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      registerFilter={reportRegisterFieldOf({
        filter: services.reportFiltersRegisterFilter,
        services: services.reportRegisterFilter,
        onSessionEnded: sessionActions.sessionEnded,
      })}
      services={services.salesByCashierScreen ?? defaultSalesByCashierScreenServices}
    />
  );
}
