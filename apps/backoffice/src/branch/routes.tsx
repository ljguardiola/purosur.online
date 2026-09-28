import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { canSeeBranchArea } from "../access/backoffice-access";
import { settingsAreaRoute } from "../shell/settings-area";
import { refuseWithout } from "../shell/signed-in-route";

export const branchSettingsRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "branch",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeBranchArea),
  component: lazyRouteComponent(() => import("./branch-settings-page"), "BranchSettingsPage"),
});
