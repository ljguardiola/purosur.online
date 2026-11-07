import { createRoute, redirect } from "@tanstack/react-router";
import { lazyScreen } from "../shell/lazy-screen";
import { publicRoute } from "../shell/public-route";
import { signedInRoute } from "../shell/signed-in-route";

export const accountRecoveryRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "account-recovery",
  component: lazyScreen(() => import("./account-recovery-page"), "AccountRecoveryPage"),
});

export const registerPasskeyRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "account-recovery/passkey",
  component: lazyScreen(() => import("./register-passkey-page"), "RegisterPasskeyPage"),
});

export const legacyAccountRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "account",
  beforeLoad: () => {
    throw redirect({ to: "/", search: { account: "credentials" } });
  },
});
