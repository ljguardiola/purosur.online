import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { ExpiringLotsScreen } from "./expiring-lots-screen";
import { defaultExpiringLotsScreenServices } from "./expiring-lots-services";

const route = getRouteApi("/signed-in/stock-area/expiring-lots");

export function ExpiringLotsPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Vencimientos · Puro Sur");
  return (
    <ExpiringLotsScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.expiringLotsScreen ?? defaultExpiringLotsScreenServices}
    />
  );
}
