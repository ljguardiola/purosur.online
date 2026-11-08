import { getRouteApi, useRouterState } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { purchasedProductsToReviewIn } from "../platform/purchased-products-to-review";
import { PricesListScreen } from "./prices-list-screen";
import { defaultPricesListScreenServices } from "./prices-list-services";

const route = getRouteApi("/signed-in/products-area/products/prices");

export function PricesListPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  const purchasedProductsToReview = useRouterState({
    select: (state) => purchasedProductsToReviewIn(state.location.state),
  });
  return (
    <PricesListScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      purchasedProductsToReview={purchasedProductsToReview}
      onPurchaseReviewTaken={() => void navigate({ search: true, replace: true, state: {} })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.pricesListScreen ?? defaultPricesListScreenServices}
    />
  );
}
