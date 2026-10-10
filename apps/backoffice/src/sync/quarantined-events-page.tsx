import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { QuarantinedEventsScreen } from "./quarantined-events-screen";
import { defaultQuarantinedEventsScreenServices } from "./quarantined-events-services";

const route = getRouteApi("/signed-in/settings-area/quarantined-events");

export function QuarantinedEventsPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  useDocumentTitle("Eventos en cuarentena · Puro Sur");
  return (
    <QuarantinedEventsScreen
      onSessionEnded={sessionActions.sessionEnded}
      services={services.quarantinedEventsScreen ?? defaultQuarantinedEventsScreenServices}
    />
  );
}
