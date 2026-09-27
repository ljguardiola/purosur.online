import { createRoute } from "@tanstack/react-router";
import { canSeeAlertsArea } from "../access/backoffice-access";
import { useDocumentTitle } from "../shell/document-title";
import { homeAreaRoute } from "../shell/home-area";
import { refuseWithout } from "../shell/signed-in-route";
import { AlertsListScreen } from "./alerts-list-screen";

export const alertsListRoute = createRoute({
  getParentRoute: () => homeAreaRoute,
  path: "alerts",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeAlertsArea),
  component: AlertsListPage,
});

function AlertsListPage() {
  const { session, services, sessionActions } = alertsListRoute.useRouteContext();
  useDocumentTitle("Alertas · Puro Sur");
  return (
    <AlertsListScreen
      access={session}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.alertsListScreen}
    />
  );
}
