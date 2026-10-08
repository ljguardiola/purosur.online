import { createRoute, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { canSeeUsersArea } from "../shell/backoffice-access";
import { lazyScreen } from "../shell/lazy-screen";
import { settingsAreaRoute } from "../shell/settings-area";
import { refuseWithout } from "../shell/signed-in-route";

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
