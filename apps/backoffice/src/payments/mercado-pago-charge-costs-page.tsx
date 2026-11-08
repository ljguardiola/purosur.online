import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { MercadoPagoChargeCostsScreen } from "./mercado-pago-charge-costs-screen";
import { defaultMercadoPagoChargeCostsScreenServices } from "./mercado-pago-charge-costs-services";

const route = getRouteApi("/signed-in/reports-area/reports/mercado-pago-charge-costs");

export function MercadoPagoChargeCostsPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Costos de Mercado Pago · Puro Sur");
  return (
    <MercadoPagoChargeCostsScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={
        services.mercadoPagoChargeCostsScreen ?? defaultMercadoPagoChargeCostsScreenServices
      }
    />
  );
}
