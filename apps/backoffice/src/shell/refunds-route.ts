import { createRoute, redirect } from "@tanstack/react-router";
import { canSeeRefundsPage } from "./backoffice-access";
import { lazyScreen } from "./lazy-screen";
import { REFUNDS_TABS, type RefundsTab } from "./refunds-tabs";
import { salesAndCashAreaRoute } from "./sales-and-cash-area";
import { refuseWithout } from "./signed-in-route";

export const refundsRoute = createRoute({
  getParentRoute: () => salesAndCashAreaRoute,
  path: "refunds",
  beforeLoad: ({ context: { session } }) => {
    refuseWithout(session, canSeeRefundsPage);
    return {
      refundsTabs: REFUNDS_TABS.filter((tab) => tab.isVisibleTo(session)).map((tab) => tab.key),
    };
  },
  component: lazyScreen(() => import("./refunds-page"), "RefundsPage"),
});

export function refundsTabRedirect(refundsTabs: readonly RefundsTab[], own: RefundsTab): void {
  if (!refundsTabs.includes(own)) {
    throw redirect({ to: own === "pending" ? "/refunds/history" : "/refunds" });
  }
}
