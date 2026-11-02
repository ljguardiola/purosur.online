import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { OrderSuggestionScreen } from "./order-suggestion-screen";
import { defaultOrderSuggestionScreenServices } from "./order-suggestion-services";

const route = getRouteApi("/signed-in/orders-area/order-suggestion");

export function OrderSuggestionPage(): ReactElement {
  const { services, session, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Sugerencia de pedido · Puro Sur");
  return (
    <OrderSuggestionScreen
      access={session}
      onOrdersBuilt={() => void navigate({ to: "/purchase-orders" })}
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.orderSuggestionScreen ?? defaultOrderSuggestionScreenServices}
    />
  );
}
