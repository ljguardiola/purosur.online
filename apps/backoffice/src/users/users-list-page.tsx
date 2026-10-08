import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { UsersListScreen } from "./users-list-screen";

const route = getRouteApi("/signed-in/settings-area/users");

export function UsersListPage(): ReactElement {
  const { session, services, sessionActions } = route.useRouteContext();
  const filters = route.useSearch();
  const navigate = route.useNavigate();
  useDocumentTitle("Usuarios · Puro Sur");
  return (
    <UsersListScreen
      filters={filters}
      onFiltersChange={(next) => void navigate({ search: next, replace: true })}
      access={session}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.usersListScreen}
    />
  );
}
