import { createRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { lazyScreen } from "../shell/lazy-screen";
import { peopleRoute, peopleTabRedirect } from "../shell/people-route";
import { signedInRoute } from "../shell/signed-in-route";

export const usersListFilters = z.object({
  state: z.enum(["all", "active", "inactive"]).default("all").catch("all"),
});

export type UsersListFilters = z.output<typeof usersListFilters>;

const usersListSearch = usersListFilters.extend({
  user: z.string().optional().catch(undefined),
  tab: z.enum(["data", "credentials", "status"]).optional().catch(undefined),
});

export const usersListRoute = createRoute({
  getParentRoute: () => peopleRoute,
  path: "users",
  beforeLoad: ({ context: { session } }) => peopleTabRedirect(session, "users"),
  validateSearch: usersListSearch,
  search: { middlewares: [stripSearchParams(usersListFilters.parse({}))] },
  component: lazyScreen(() => import("./users-list-page"), "UsersListPage"),
});

export const legacyUsersRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "users",
  validateSearch: usersListFilters,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/people/users", search: { state: search.state } });
  },
});

export const legacyUserRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "users/$userId",
  beforeLoad: ({ params: { userId } }) => {
    throw redirect({ to: "/people/users", search: { user: userId } });
  },
});
