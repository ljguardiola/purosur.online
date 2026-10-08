import { createRoute, stripSearchParams } from "@tanstack/react-router";
import { canSeeRefundsArea, canSeeReports } from "../shell/backoffice-access";
import { cashAndFiscalAreaRoute } from "../shell/cash-and-fiscal-area";
import { lazyScreen } from "../shell/lazy-screen";
import { reportsAreaRoute } from "../shell/reports-area";
import { refuseWithout } from "../shell/signed-in-route";
import { salesByDayFilters } from "./sales-by-day-filters";

export const reportsIndexRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeReports),
  component: lazyScreen(() => import("./reports-index-page"), "ReportsIndexPage"),
});

export const salesByDayRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports/sales-by-day",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeReports),
  validateSearch: salesByDayFilters,
  search: { middlewares: [stripSearchParams(salesByDayFilters.parse({}))] },
  component: lazyScreen(() => import("./sales-by-day-page"), "SalesByDayPage"),
});

export const pendingRefundsRoute = createRoute({
  getParentRoute: () => cashAndFiscalAreaRoute,
  path: "pending-refunds",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeRefundsArea),
  component: lazyScreen(() => import("./pending-refunds-page"), "PendingRefundsPage"),
});
