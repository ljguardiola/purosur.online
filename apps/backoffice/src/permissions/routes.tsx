import { createRoute, redirect } from "@tanstack/react-router";
import { lazyScreen } from "../shell/lazy-screen";
import { peopleRoute, peopleTabRedirect } from "../shell/people-route";
import { signedInRoute } from "../shell/signed-in-route";

export const rolesListRoute = createRoute({
  getParentRoute: () => peopleRoute,
  path: "roles",
  beforeLoad: ({ context: { session } }) => peopleTabRedirect(session, "roles"),
  component: lazyScreen(() => import("./roles-list-page"), "RolesListPage"),
});

export const legacyRolesRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "roles",
  beforeLoad: () => {
    throw redirect({ to: "/people/roles" });
  },
});
