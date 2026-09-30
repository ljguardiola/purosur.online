import { createRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { lazyScreen } from "../shell/lazy-screen";
import { publicRoute } from "../shell/public-route";
import { settingsAreaRoute } from "../shell/settings-area";
import { refuseWithout } from "../shell/signed-in-route";
import { canSeeRolesArea, canSeeUsersArea } from "./backoffice-access";

export const signInRoute = createRoute({
  getParentRoute: () => publicRoute,
  path: "sign-in",
  beforeLoad: ({ context: { session } }) => {
    if (session.kind === "signed-in") {
      throw redirect({ to: "/" });
    }
  },
  component: lazyScreen(() => import("./sign-in-page"), "SignInPage"),
});

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

export const usersListFilters = z.object({
  state: z.enum(["all", "active", "inactive"]).default("all").catch("all"),
});

export type UsersListFilters = z.output<typeof usersListFilters>;

export const usersListRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "users",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeUsersArea),
  validateSearch: usersListFilters,
  search: { middlewares: [stripSearchParams(usersListFilters.parse({}))] },
  component: lazyScreen(() => import("./users-list-page"), "UsersListPage"),
});

export const userDetailRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "users/$userId",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeUsersArea),
  component: lazyScreen(() => import("./user-detail-page"), "UserDetailPage"),
});

export const rolesListRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "roles",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeRolesArea),
  component: lazyScreen(() => import("./roles-list-page"), "RolesListPage"),
});
