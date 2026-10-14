import { createRoute, stripSearchParams } from "@tanstack/react-router";
import { canSeeReports } from "../shell/backoffice-access";
import { lazyScreen } from "../shell/lazy-screen";
import { reportFiltersSearch } from "../shell/report-filters-search";
import { reportsAreaRoute } from "../shell/reports-area";
import { refuseWithout } from "../shell/signed-in-route";
import { averageTicketFilters } from "./average-ticket-filters";
import { salesByCashierFilters } from "./sales-by-cashier-filters";
import { salesByProductAndCategoryFilters } from "./sales-by-product-and-category-filters";

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
  validateSearch: reportFiltersSearch,
  search: { middlewares: [stripSearchParams(reportFiltersSearch.parse({}))] },
  component: lazyScreen(() => import("./sales-by-day-page"), "SalesByDayPage"),
});

export const salesByProductAndCategoryRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports/sales-by-product-and-category",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeReports),
  validateSearch: salesByProductAndCategoryFilters,
  search: { middlewares: [stripSearchParams(salesByProductAndCategoryFilters.parse({}))] },
  component: lazyScreen(
    () => import("./sales-by-product-and-category-page"),
    "SalesByProductAndCategoryPage",
  ),
});

export const salesByCashierRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports/sales-by-cashier",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeReports),
  validateSearch: salesByCashierFilters,
  search: { middlewares: [stripSearchParams(salesByCashierFilters.parse({}))] },
  component: lazyScreen(() => import("./sales-by-cashier-page"), "SalesByCashierPage"),
});

export const averageTicketRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports/average-ticket",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeReports),
  validateSearch: averageTicketFilters,
  search: { middlewares: [stripSearchParams(averageTicketFilters.parse({}))] },
  component: lazyScreen(() => import("./average-ticket-page"), "AverageTicketPage"),
});
