import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { SuppliersListScreen } from "./suppliers-list-screen";
import { defaultSuppliersListScreenServices } from "./suppliers-list-services";

const route = getRouteApi("/signed-in/purchasing-area/suppliers/");

export function SuppliersListPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <SuppliersListScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.suppliersListScreen ?? defaultSuppliersListScreenServices}
    />
  );
}
