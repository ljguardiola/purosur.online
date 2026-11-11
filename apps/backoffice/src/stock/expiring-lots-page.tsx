import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { ExpiringLotsScreen } from "./expiring-lots-screen";
import { defaultExpiringLotsScreenServices } from "./expiring-lots-services";

const route = getRouteApi("/signed-in/stock-area/stock/expiries");

export function ExpiringLotsPage(): ReactElement {
  const { services, session, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <ExpiringLotsScreen
      access={session}
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.expiringLotsScreen ?? defaultExpiringLotsScreenServices}
    />
  );
}
