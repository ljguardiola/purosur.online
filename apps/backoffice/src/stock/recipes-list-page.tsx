import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { RecipesListScreen } from "./recipes-list-screen";
import { defaultRecipesListScreenServices } from "./recipes-list-services";

const route = getRouteApi("/signed-in/stock-area/recipes");

export function RecipesListPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Recetas · Puro Sur");
  return (
    <RecipesListScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.recipesListScreen ?? defaultRecipesListScreenServices}
    />
  );
}
