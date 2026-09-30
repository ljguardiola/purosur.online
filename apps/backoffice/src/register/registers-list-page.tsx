import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { RegistersListScreen } from "./registers-list-screen";

const route = getRouteApi("/signed-in/settings-area/registers");

export function RegistersListPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  useDocumentTitle("Cajas registradoras · Puro Sur");
  return (
    <RegistersListScreen
      onSessionEnded={sessionActions.sessionEnded}
      services={services.registersListScreen}
    />
  );
}
