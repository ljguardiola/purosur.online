import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { CategoriesListScreen } from "./categories-list-screen";

const route = getRouteApi("/signed-in/catalog/categories");

export function CategoriesListPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Categorías · Puro Sur");
  return (
    <CategoriesListScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.categoriesListScreen}
    />
  );
}
