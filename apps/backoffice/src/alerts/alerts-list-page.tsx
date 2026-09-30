import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { AlertsListScreen } from "./alerts-list-screen";

const route = getRouteApi("/signed-in/home-area/alerts");

export function AlertsListPage(): ReactElement {
  const { session, services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Alertas · Puro Sur");
  return (
    <AlertsListScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      access={session}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.alertsListScreen}
    />
  );
}
