import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { BrandsListScreen } from "./brands-list-screen";
import { defaultBrandsListScreenServices } from "./brands-list-services";

const route = getRouteApi("/signed-in/products-area/products/classification/brands");

export function BrandsListPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <BrandsListScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.brandsListScreen ?? defaultBrandsListScreenServices}
    />
  );
}
