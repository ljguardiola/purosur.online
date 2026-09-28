import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { RolesListScreen } from "./roles-list-screen";

const route = getRouteApi("/signed-in/settings/roles");

export function RolesListPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  useDocumentTitle("Roles · Puro Sur");
  return (
    <RolesListScreen
      onSessionEnded={sessionActions.sessionEnded}
      services={services.rolesListScreen}
    />
  );
}
