import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { PendingRefundsScreen } from "./pending-refunds-screen";
import { defaultPendingRefundsScreenServices } from "./pending-refunds-services";

const route = getRouteApi("/signed-in/cash-and-fiscal-area/pending-refunds");

export function PendingRefundsPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Reembolsos pendientes · Puro Sur");
  return (
    <PendingRefundsScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.pendingRefundsScreen ?? defaultPendingRefundsScreenServices}
    />
  );
}
