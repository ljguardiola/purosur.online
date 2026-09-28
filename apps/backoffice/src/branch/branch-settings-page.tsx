import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { BranchSettingsScreen } from "./branch-settings-screen";

const route = getRouteApi("/signed-in/settings/branch");

export function BranchSettingsPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  useDocumentTitle("Sucursal · Puro Sur");
  return (
    <BranchSettingsScreen
      onSessionEnded={sessionActions.sessionEnded}
      services={services.branchSettingsScreen}
    />
  );
}
