import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { FiscalConfigurationScreen } from "./fiscal-configuration-screen";

const route = getRouteApi("/signed-in/cash-and-fiscal/fiscal-configuration");

export function FiscalConfigurationPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  useDocumentTitle("Configuración fiscal · Puro Sur");
  return (
    <FiscalConfigurationScreen
      onSessionEnded={sessionActions.sessionEnded}
      services={services.fiscalConfigurationScreen}
    />
  );
}
