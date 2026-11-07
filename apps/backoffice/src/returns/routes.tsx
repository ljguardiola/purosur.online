import { createRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { lazyScreen } from "../shell/lazy-screen";
import { refundsRoute, refundsTabRedirect } from "../shell/refunds-route";
import { reportFiltersSearch } from "../shell/report-filters-search";
import { signedInRoute } from "../shell/signed-in-route";

export const returnsHistoryRoute = createRoute({
  getParentRoute: () => refundsRoute,
  path: "history",
  beforeLoad: ({ context: { refundsTabs } }) => refundsTabRedirect(refundsTabs, "history"),
  validateSearch: reportFiltersSearch,
  search: { middlewares: [stripSearchParams(reportFiltersSearch.parse({}))] },
  component: lazyScreen(() => import("./returns-history-page"), "ReturnsHistoryPage"),
});

export const legacyReturnsReportRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "reports/returns",
  validateSearch: reportFiltersSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/refunds/history", search });
  },
});
