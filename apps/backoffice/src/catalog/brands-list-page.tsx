import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { BrandsListScreen } from "./brands-list-screen";

const route = getRouteApi("/signed-in/catalog/brands");

export function BrandsListPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Marcas · Puro Sur");
  return (
    <BrandsListScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.brandsListScreen}
    />
  );
}
