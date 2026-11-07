import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { RecipesListScreen } from "./recipes-list-screen";
import { defaultRecipesListScreenServices } from "./recipes-list-services";

const route = getRouteApi("/signed-in/products-area/products/assemblies/");

export function RecipesListPage(): ReactElement {
  const { services, session, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <RecipesListScreen
      access={session}
      productCreationModal={services.productCreationModal}
      productPriceSection={services.productPriceSection}
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.recipesListScreen ?? defaultRecipesListScreenServices}
    />
  );
}
