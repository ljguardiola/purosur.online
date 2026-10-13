import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { InitialInventoryScreen } from "./initial-inventory-screen";
import { defaultInitialInventoryScreenServices } from "./initial-inventory-services";

const route = getRouteApi("/signed-in/stock-area/initial-inventory");

export function InitialInventoryPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Inventario inicial · Puro Sur");
  return (
    <InitialInventoryScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.initialInventoryScreen ?? defaultInitialInventoryScreenServices}
    />
  );
}
