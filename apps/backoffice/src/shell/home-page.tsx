import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { AlertsOverviewScreen } from "../alerts/alerts-overview-screen";
import { RegistersSyncSection } from "../register/registers-sync-section";
import { useDocumentTitle } from "./document-title";

const route = getRouteApi("/signed-in/home-area/");

export function HomePage(): ReactElement {
  const { session, services, sessionActions } = route.useRouteContext();
  useDocumentTitle("Inicio · Puro Sur");
  return (
    <AlertsOverviewScreen
      access={session}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.alertsOverviewScreen}
    >
      <RegistersSyncSection
        onSessionEnded={sessionActions.sessionEnded}
        services={services.registersSyncSection}
      />
    </AlertsOverviewScreen>
  );
}
