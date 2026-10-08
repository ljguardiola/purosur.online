import { createRoute } from "@tanstack/react-router";
import { canSeeRolesArea } from "../shell/backoffice-access";
import { lazyScreen } from "../shell/lazy-screen";
import { settingsAreaRoute } from "../shell/settings-area";
import { refuseWithout } from "../shell/signed-in-route";

export const rolesListRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "roles",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeRolesArea),
  component: lazyScreen(() => import("./roles-list-page"), "RolesListPage"),
});
