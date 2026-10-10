import { createRoute } from "@tanstack/react-router";
import { canSeeQuarantinedEvents } from "../shell/backoffice-access";
import { lazyScreen } from "../shell/lazy-screen";
import { settingsAreaRoute } from "../shell/settings-area";
import { refuseWithout } from "../shell/signed-in-route";

export const quarantinedEventsRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "quarantined-events",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeQuarantinedEvents),
  component: lazyScreen(() => import("./quarantined-events-page"), "QuarantinedEventsPage"),
});
