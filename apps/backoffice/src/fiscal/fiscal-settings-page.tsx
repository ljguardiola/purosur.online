import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { FiscalSettingsScreen } from "./fiscal-settings-screen";
import { defaultFiscalSettingsScreenServices } from "./fiscal-settings-services";

const route = getRouteApi("/signed-in/fiscal-area/fiscal/settings");

export function FiscalSettingsPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  return (
    <FiscalSettingsScreen
      onSessionEnded={sessionActions.sessionEnded}
      services={services.fiscalSettingsScreen ?? defaultFiscalSettingsScreenServices}
    />
  );
}
