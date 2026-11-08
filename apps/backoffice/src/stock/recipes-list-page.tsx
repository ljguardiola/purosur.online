import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { defaultAssemblyBatchesScreenServices } from "./assembly-batches-services";
import { RecipesListScreen } from "./recipes-list-screen";
import { defaultRecipesListScreenServices } from "./recipes-list-services";

const route = getRouteApi("/signed-in/products-area/products/assemblies/");

export function RecipesListPage(): ReactElement {
  const { services, session, sessionActions } = route.useRouteContext();
  const { recipe, ...filters } = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <RecipesListScreen
      access={session}
      productCreationModal={services.productCreationModal}
      productPriceSection={services.productPriceSection}
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: { ...next, recipe }, replace: true })}
      openRecipe={recipe}
      onOpenRecipeChange={(next) =>
        void navigate({
          search: { ...filters, recipe: next },
          ...(next === undefined ? { replace: true } : {}),
        })
      }
      batchServices={services.assemblyBatchesScreen ?? defaultAssemblyBatchesScreenServices}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.recipesListScreen ?? defaultRecipesListScreenServices}
    />
  );
}
