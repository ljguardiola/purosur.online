import { createRoute, redirect } from "@tanstack/react-router";
import { canSeeBranchArea } from "../shell/backoffice-access";
import { lazyScreen } from "../shell/lazy-screen";
import { settingsAreaRoute } from "../shell/settings-area";
import { refuseWithout, signedInRoute } from "../shell/signed-in-route";

export const branchSettingsRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "branch",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeBranchArea),
  component: lazyScreen(() => import("./branch-settings-page"), "BranchSettingsPage"),
});

export const legacyBranchSettingsRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "location-settings",
  beforeLoad: () => {
    throw redirect({ to: "/branch" });
  },
});
