import { createRoute } from "@tanstack/react-router";
import { canSeeRefundsArea } from "../shell/backoffice-access";
import { cashAndFiscalAreaRoute } from "../shell/cash-and-fiscal-area";
import { lazyScreen } from "../shell/lazy-screen";
import { refuseWithout } from "../shell/signed-in-route";

export const pendingRefundsRoute = createRoute({
  getParentRoute: () => cashAndFiscalAreaRoute,
  path: "pending-refunds",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeRefundsArea),
  component: lazyScreen(() => import("./pending-refunds-page"), "PendingRefundsPage"),
});
