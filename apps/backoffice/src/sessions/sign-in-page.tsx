import { getRouteApi } from "@tanstack/react-router";
import type { ReactElement } from "react";
import { SignInScreen } from "./sign-in-screen";
import { defaultSignInScreenServices } from "./sign-in-services";

const route = getRouteApi("/public/sign-in");

export function SignInPage(): ReactElement {
  const { session, services, sessionActions } = route.useRouteContext();
  return (
    <SignInScreen
      openingNotice={session.kind === "signed-out" ? session.notice : undefined}
      onSignedIn={sessionActions.signedIn}
      services={services.signInScreen ?? defaultSignInScreenServices}
    />
  );
}
