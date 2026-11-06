import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { RolesListScreen } from "./roles-list-screen";
import { defaultRolesListScreenServices } from "./roles-list-services";

const route = getRouteApi("/signed-in/settings-area/people/roles");

export function RolesListPage(): ReactElement {
  const { services, sessionActions } = route.useRouteContext();
  return (
    <RolesListScreen
      onSessionEnded={sessionActions.sessionEnded}
      services={services.rolesListScreen ?? defaultRolesListScreenServices}
    />
  );
}
