import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { SuppliersListScreen } from "./suppliers-list-screen";
import { defaultSuppliersListScreenServices } from "./suppliers-list-services";

const route = getRouteApi("/signed-in/stock-area/suppliers");

export function SuppliersListPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Proveedores · Puro Sur");
  return (
    <SuppliersListScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.suppliersListScreen ?? defaultSuppliersListScreenServices}
    />
  );
}
