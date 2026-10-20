import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { MercadoPagoRefundsScreen } from "./mercado-pago-refunds-screen";
import { defaultMercadoPagoRefundsScreenServices } from "./mercado-pago-refunds-services";

const route = getRouteApi("/signed-in/cash-and-fiscal-area/refunds/mercado-pago");

export function MercadoPagoRefundsPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Reembolsos de Mercado Pago · Puro Sur");
  return (
    <MercadoPagoRefundsScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.mercadoPagoRefundsScreen ?? defaultMercadoPagoRefundsScreenServices}
    />
  );
}
