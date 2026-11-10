import { createRoute, redirect } from "@tanstack/react-router";
import { canSeeQuarantinedEvents } from "../shell/backoffice-access";
import { lazyScreen } from "../shell/lazy-screen";
import { settingsAreaRoute } from "../shell/settings-area";
import { refuseWithout, signedInRoute } from "../shell/signed-in-route";

export const quarantinedEventsRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "held-register-changes",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeQuarantinedEvents),
  component: lazyScreen(() => import("./quarantined-events-page"), "QuarantinedEventsPage"),
});

export const legacyQuarantinedEventsRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "quarantined-events",
  beforeLoad: () => {
    throw redirect({ to: "/held-register-changes" });
  },
});
