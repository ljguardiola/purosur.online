import { createRoute, stripSearchParams } from "@tanstack/react-router";
import { canSeeReturnsReport } from "../shell/backoffice-access";
import { lazyScreen } from "../shell/lazy-screen";
import { reportFiltersSearch } from "../shell/report-filters-search";
import { reportsAreaRoute } from "../shell/reports-area";
import { refuseWithout } from "../shell/signed-in-route";

export const returnsReportRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports/returns",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeReturnsReport),
  validateSearch: reportFiltersSearch,
  search: { middlewares: [stripSearchParams(reportFiltersSearch.parse({}))] },
  component: lazyScreen(() => import("./returns-report-page"), "ReturnsReportPage"),
});
