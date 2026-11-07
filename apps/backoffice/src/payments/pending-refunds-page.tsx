import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { PendingRefundsScreen } from "./pending-refunds-screen";
import { defaultPendingRefundsScreenServices } from "./pending-refunds-services";

const route = getRouteApi("/signed-in/sales-and-cash-area/refunds/");

export function PendingRefundsPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <PendingRefundsScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.pendingRefundsScreen ?? defaultPendingRefundsScreenServices}
    />
  );
}
