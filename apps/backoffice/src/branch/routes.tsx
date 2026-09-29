import { createRoute } from "@tanstack/react-router";
import { canSeeBranchArea } from "../access/backoffice-access";
import { lazyScreen } from "../shell/lazy-screen";
import { settingsAreaRoute } from "../shell/settings-area";
import { refuseWithout } from "../shell/signed-in-route";

export const branchSettingsRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "branch",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeBranchArea),
  component: lazyScreen(() => import("./branch-settings-page"), "BranchSettingsPage"),
});
