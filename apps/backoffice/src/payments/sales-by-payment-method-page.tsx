import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { reportRegisterFieldOf } from "../shell/report-register-field";
import { SalesByPaymentMethodScreen } from "./sales-by-payment-method-screen";
import { defaultSalesByPaymentMethodScreenServices } from "./sales-by-payment-method-services";

const route = getRouteApi("/signed-in/reports-area/reports/sales-by-payment-method");

export function SalesByPaymentMethodPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Ventas por medio de pago · Puro Sur");
  return (
    <SalesByPaymentMethodScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      registerFilter={reportRegisterFieldOf({
        filter: services.reportFiltersRegisterFilter,
        services: services.reportRegisterFilter,
        onSessionEnded: sessionActions.sessionEnded,
      })}
      services={services.salesByPaymentMethodScreen ?? defaultSalesByPaymentMethodScreenServices}
    />
  );
}
