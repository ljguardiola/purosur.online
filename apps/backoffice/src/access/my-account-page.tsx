import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { useDocumentTitle } from "../shell/document-title";
import { MyAccountScreen } from "./my-account-screen";

const route = getRouteApi("/signed-in/settings/users/me");

export function MyAccountPage(): ReactElement {
  const { session, services, sessionActions } = route.useRouteContext();
  useDocumentTitle("Mi cuenta · Puro Sur");
  return (
    <MyAccountScreen
      displayName={session.displayName}
      userId={session.userId}
      access={session}
      onSessionEnded={sessionActions.sessionEnded}
      services={services.myAccountScreen}
    />
  );
}
