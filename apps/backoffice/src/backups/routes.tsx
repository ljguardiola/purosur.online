import { createRoute } from "@tanstack/react-router";
import { canSeeContingencyTicketRescue } from "../shell/backoffice-access";
import { lazyScreen } from "../shell/lazy-screen";
import { settingsAreaRoute } from "../shell/settings-area";
import { refuseWithout } from "../shell/signed-in-route";

export const contingencyTicketRescueRoute = createRoute({
  getParentRoute: () => settingsAreaRoute,
  path: "contingency-ticket-rescue",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeContingencyTicketRescue),
  component: lazyScreen(() => import("./contingency-ticket-rescue-page"), "ContingencyTicketRescuePage"),
});
