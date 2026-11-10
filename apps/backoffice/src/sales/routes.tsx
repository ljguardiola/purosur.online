import { createRoute, stripSearchParams } from "@tanstack/react-router";
import { lazyScreen } from "../shell/lazy-screen";
import { reportFiltersSearch } from "../shell/report-filters-search";
import { reportsRoute, reportViewRedirect } from "../shell/reports-route";
import { averageTicketFilters } from "./average-ticket-filters";
import { manualDiscountsFilters } from "./manual-discounts-filters";
import { salesByCashierFilters } from "./sales-by-cashier-filters";
import { salesByProductAndCategoryFilters } from "./sales-by-product-and-category-filters";
import { salesByPromotionFilters } from "./sales-by-promotion-filters";

export const salesByDayRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: "sales-by-day",
  beforeLoad: ({ context: { reportViews }, search }) =>
    reportViewRedirect(reportViews, "sales-by-day", search),
  validateSearch: reportFiltersSearch,
  search: { middlewares: [stripSearchParams(reportFiltersSearch.parse({}))] },
  component: lazyScreen(() => import("./sales-by-day-page"), "SalesByDayPage"),
});

export const salesByProductAndCategoryRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: "sales-by-product-and-category",
  beforeLoad: ({ context: { reportViews }, search }) =>
    reportViewRedirect(reportViews, "sales-by-product-and-category", search),
  validateSearch: salesByProductAndCategoryFilters,
  search: { middlewares: [stripSearchParams(salesByProductAndCategoryFilters.parse({}))] },
  component: lazyScreen(
    () => import("./sales-by-product-and-category-page"),
    "SalesByProductAndCategoryPage",
  ),
});

export const salesByCashierRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: "sales-by-cashier",
  beforeLoad: ({ context: { reportViews }, search }) =>
    reportViewRedirect(reportViews, "sales-by-cashier", search),
  validateSearch: salesByCashierFilters,
  search: { middlewares: [stripSearchParams(salesByCashierFilters.parse({}))] },
  component: lazyScreen(() => import("./sales-by-cashier-page"), "SalesByCashierPage"),
});

export const salesByPromotionRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: "sales-by-promotion",
  beforeLoad: ({ context: { reportViews }, search }) =>
    reportViewRedirect(reportViews, "sales-by-promotion", search),
  validateSearch: salesByPromotionFilters,
  search: { middlewares: [stripSearchParams(salesByPromotionFilters.parse({}))] },
  component: lazyScreen(() => import("./sales-by-promotion-page"), "SalesByPromotionPage"),
});

export const manualDiscountsRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: "manual-discounts",
  beforeLoad: ({ context: { reportViews }, search }) =>
    reportViewRedirect(reportViews, "manual-discounts", search),
  validateSearch: manualDiscountsFilters,
  search: { middlewares: [stripSearchParams(manualDiscountsFilters.parse({}))] },
  component: lazyScreen(() => import("./manual-discounts-page"), "ManualDiscountsPage"),
});

export const cashRoundingRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: "cash-rounding",
  beforeLoad: ({ context: { reportViews }, search }) =>
    reportViewRedirect(reportViews, "cash-rounding", search),
  validateSearch: reportFiltersSearch,
  search: { middlewares: [stripSearchParams(reportFiltersSearch.parse({}))] },
  component: lazyScreen(() => import("./cash-rounding-page"), "CashRoundingPage"),
});

export const averageTicketRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: "average-ticket",
  beforeLoad: ({ context: { reportViews }, search }) =>
    reportViewRedirect(reportViews, "average-ticket", search),
  validateSearch: averageTicketFilters,
  search: { middlewares: [stripSearchParams(averageTicketFilters.parse({}))] },
  component: lazyScreen(() => import("./average-ticket-page"), "AverageTicketPage"),
});

export const handTypedWeightsRoute = createRoute({
  getParentRoute: () => reportsRoute,
  path: "hand-typed-weights",
  beforeLoad: ({ context: { reportViews }, search }) =>
    reportViewRedirect(reportViews, "hand-typed-weights", search),
  validateSearch: reportFiltersSearch,
  search: { middlewares: [stripSearchParams(reportFiltersSearch.parse({}))] },
  component: lazyScreen(() => import("./hand-typed-weights-page"), "HandTypedWeightsPage"),
});
