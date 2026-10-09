import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { UserDetailScreen } from "./user-detail-screen";

const route = getRouteApi("/signed-in/settings-area/users/$userId");

export function UserDetailPage(): ReactElement {
  const { session, services, sessionActions } = route.useRouteContext();
  const { userId } = route.useParams();
  useDocumentTitle("Usuarios · Puro Sur");
  return (
    <UserDetailScreen
      userId={userId}
      signedInUserId={session.userId}
      access={session}
      onSessionEnded={sessionActions.sessionEnded}
      credentialSections={services.userDetailScreen.credentialSections}
      services={services.userDetailScreen}
    />
  );
}
