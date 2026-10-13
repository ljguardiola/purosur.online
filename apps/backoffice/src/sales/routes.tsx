import { createRoute, stripSearchParams } from "@tanstack/react-router";
import { canSeeReports } from "../shell/backoffice-access";
import { lazyScreen } from "../shell/lazy-screen";
import { reportFiltersSearch } from "../shell/report-filters-search";
import { reportsAreaRoute } from "../shell/reports-area";
import { refuseWithout } from "../shell/signed-in-route";

export const salesByDayRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports/sales-by-day",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeReports),
  validateSearch: reportFiltersSearch,
  search: { middlewares: [stripSearchParams(reportFiltersSearch.parse({}))] },
  component: lazyScreen(() => import("./sales-by-day-page"), "SalesByDayPage"),
});
