import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { createContext, useContext, useEffect, useRef } from "react";
import type { SignInOpeningNotice } from "../access/sign-in-screen";
import type { BackofficeHelpCatalog } from "../help/help-catalog";
import type { AppServices } from "./app";
import { focusScreenTitle } from "./screen-title";

export type SignedInSession = {
  kind: "signed-in";
  userId: string;
  displayName: string;
  isAdministrator: boolean;
  permissions: string[];
  expiresAt?: string;
};

type SignedOutSession = { kind: "signed-out"; notice: SignInOpeningNotice | undefined };

export type SettledSession = SignedInSession | SignedOutSession;

export type SessionActions = {
  signedIn: () => void;
  signedOut: () => void;
  sessionEnded: () => void;
};

export type RouterContext = {
  session: SettledSession;
  help: BackofficeHelpCatalog;
  services: AppServices;
  sessionActions: SessionActions;
};

export const SessionCheckPendingContext = createContext(false);

function Root() {
  const pending = useContext(SessionCheckPendingContext);
  const wasPending = useRef(pending);
  useEffect(() => {
    if (wasPending.current && !pending) {
      focusScreenTitle();
    }
    wasPending.current = pending;
  }, [pending]);
  return pending ? null : <Outlet />;
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Root });
