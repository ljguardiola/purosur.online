import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { DiscountsListScreen } from "./discounts-list-screen";
import { defaultDiscountsListScreenServices } from "./discounts-list-services";

const route = getRouteApi("/signed-in/products-area/products/promotions");

export function DiscountsListPage(): ReactElement {
  const { services, session, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <DiscountsListScreen
      access={session}
      productCreationModal={services.productCreationModal}
      categoryCreationModal={services.categoryCreationModal}
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.discountsListScreen ?? defaultDiscountsListScreenServices}
    />
  );
}
