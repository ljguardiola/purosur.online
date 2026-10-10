import { getRouteApi, useRouterState } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { purchasedProductsToReviewIn } from "../platform/purchased-products-to-review";
import { useDocumentTitle } from "../shell/document-title";
import { PricesListScreen } from "./prices-list-screen";

const route = getRouteApi("/signed-in/catalog-area/prices");

export function PricesListPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  const purchasedProductsToReview = useRouterState({
    select: (state) => purchasedProductsToReviewIn(state.location.state),
  });
  useDocumentTitle("Precios · Puro Sur");
  return (
    <PricesListScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      purchasedProductsToReview={purchasedProductsToReview}
      onPurchaseReviewTaken={() => void navigate({ search: true, replace: true, state: {} })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.pricesListScreen}
    />
  );
}
