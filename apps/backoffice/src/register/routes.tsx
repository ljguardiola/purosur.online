import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { canSeeRegistersArea } from "../access/backoffice-access";
import { settingsAreaRoute } from "../shell/settings-area";
import { refuseWithout } from "../shell/signed-in-route";

export const registersListRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "registers",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeRegistersArea),
  component: lazyRouteComponent(() => import("./registers-list-page"), "RegistersListPage"),
});
