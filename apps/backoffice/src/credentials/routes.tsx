import { createRoute } from "@tanstack/react-router";
import { lazyScreen } from "../shell/lazy-screen";
import { publicRoute } from "../shell/public-route";
import { settingsAreaRoute } from "../shell/settings-area";

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

export const myAccountRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "account",
  component: lazyScreen(() => import("./my-account-page"), "MyAccountPage"),
});
