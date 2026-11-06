import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { defaultUserPanelServices } from "./user-panel-services";
import { UsersListScreen } from "./users-list-screen";
import { defaultUsersListScreenServices } from "./users-list-services";

const route = getRouteApi("/signed-in/settings-area/people/users");

export function UsersListPage(): ReactElement {
  const { session, services, sessionActions } = route.useRouteContext();
  const { state, user, tab } = route.useSearch();
  const navigate = route.useNavigate();
  return (
    <UsersListScreen
      filters={{ state }}
      onFiltersChange={(next) =>
        void navigate({ search: (previous) => ({ ...previous, ...next }), replace: true })
      }
      access={session}
      roleCreationModal={services.roleCreationModal}
      onSessionEnded={sessionActions.sessionEnded}
      endEverySessionSection={services.usersListEndEverySessionSection}
      services={services.usersListScreen ?? defaultUsersListScreenServices}
      signedInUserId={session.userId}
      credentialSections={services.userPanelCredentialSections}
      detailServices={services.userPanel ?? defaultUserPanelServices}
      openUser={user}
      tab={tab}
    />
  );
}
