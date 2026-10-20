import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { CompromiseResponseScreen } from "./compromise-response-screen";
import { defaultCompromiseResponseScreenServices } from "./compromise-response-services";

const route = getRouteApi("/signed-in/settings-area/compromise-response");

export function CompromiseResponsePage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  useDocumentTitle("Respuesta ante un compromiso · Puro Sur");
  return (
    <CompromiseResponseScreen
      onSessionEnded={sessionActions.sessionEnded}
      services={services.compromiseResponseScreen ?? defaultCompromiseResponseScreenServices}
    />
  );
}
