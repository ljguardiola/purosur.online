import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { PackagingsListScreen } from "./packagings-list-screen";
import { defaultPackagingsListScreenServices } from "./packagings-list-services";

const route = getRouteApi("/signed-in/stock-area/purchase-packagings");

export function PackagingsListPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Presentaciones de compra · Puro Sur");
  return (
    <PackagingsListScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.packagingsListScreen ?? defaultPackagingsListScreenServices}
    />
  );
}
