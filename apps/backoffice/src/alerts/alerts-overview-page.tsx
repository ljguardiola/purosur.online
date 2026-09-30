import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { AlertsOverviewScreen } from "./alerts-overview-screen";

const route = getRouteApi("/signed-in/home-area/");

export function AlertsOverviewPage(): ReactElement {
  const { session, services, sessionActions } = route.useRouteContext();
  useDocumentTitle("Inicio · Puro Sur");
  return (
    <AlertsOverviewScreen
      access={session}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.alertsOverviewScreen}
    />
  );
}
