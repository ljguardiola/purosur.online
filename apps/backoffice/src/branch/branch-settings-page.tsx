import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { BranchSettingsScreen } from "./branch-settings-screen";
import { defaultBranchSettingsScreenServices } from "./branch-settings-services";

const route = getRouteApi("/signed-in/settings-area/branch");

export function BranchSettingsPage(): ReactElement {
  const { services, sessionActions, settingsTabs } = route.useRouteContext();
  useDocumentTitle("Sucursal · Puro Sur");
  return (
    <BranchSettingsScreen
      settingsTabs={settingsTabs}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.branchSettingsScreen ?? defaultBranchSettingsScreenServices}
    />
  );
}
