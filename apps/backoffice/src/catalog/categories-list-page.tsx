import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { CategoriesListScreen } from "./categories-list-screen";
import { defaultCategoriesListScreenServices } from "./categories-list-services";

const route = getRouteApi("/signed-in/products-area/products/classification/");

export function CategoriesListPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <CategoriesListScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.categoriesListScreen ?? defaultCategoriesListScreenServices}
    />
  );
}
