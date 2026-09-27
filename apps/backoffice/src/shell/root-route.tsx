import { createRootRouteWithContext, Outlet } from "@tanstack/react-router";
import { createContext, useContext } from "react";
import type { SignInOpeningNotice } from "../access/sign-in-screen";
import type { BackofficeHelpCatalog } from "../help/help-page";
import type { AppServices } from "./app";

export type SignedInSession = {
  kind: "signed-in";
  userId: string;
  displayName: string;
  isAdministrator: boolean;
  permissions: string[];
  expiresAt?: string;
};

export type SignedOutSession = { kind: "signed-out"; notice: SignInOpeningNotice | undefined };

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
  return useContext(SessionCheckPendingContext) ? null : <Outlet />;
}

export const rootRoute = createRootRouteWithContext<RouterContext>()({ component: Root });
