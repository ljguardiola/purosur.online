import { createRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { canSeeReports } from "../shell/backoffice-access";
import { lazyScreen } from "../shell/lazy-screen";
import { productsRoute, productsTabRedirect } from "../shell/products-route";
import { reportPeriodSearch } from "../shell/report-filters-search";
import { reportsAreaRoute } from "../shell/reports-area";
import { refuseWithout, signedInRoute } from "../shell/signed-in-route";

export const pricesListFilters = z.object({
  search: z.string().default("").catch(""),
  category: z.string().default("ALL").catch("ALL"),
  review: z.enum(["pending", "all"]).default("pending").catch("pending"),
});

export type PricesListFilters = z.output<typeof pricesListFilters>;

export const pricesListRoute = createRoute({
  getParentRoute: () => productsRoute,
  path: "prices",
  beforeLoad: ({ context: { productsTabs } }) => productsTabRedirect(productsTabs, "prices"),
  validateSearch: pricesListFilters,
  search: { middlewares: [stripSearchParams(pricesListFilters.parse({}))] },
  component: lazyScreen(() => import("./prices-list-page"), "PricesListPage"),
});

export const discountsListFilters = z.object({
  search: z.string().default("").catch(""),
  kind: z.enum(["ALL", "PERCENT_OFF", "BUY_N_PAY_M"]).default("ALL").catch("ALL"),
  status: z.enum(["open", "ended", "deactivated", "all"]).default("open").catch("open"),
  sortBy: z
    .enum(["promotion", "benefit", "validity", "status"])
    .default("promotion")
    .catch("promotion"),
  sort: z.enum(["ascending", "descending"]).default("ascending").catch("ascending"),
});

export type DiscountsListFilters = z.output<typeof discountsListFilters>;

export const discountsListRoute = createRoute({
  getParentRoute: () => productsRoute,
  path: "promotions",
  beforeLoad: ({ context: { productsTabs } }) => productsTabRedirect(productsTabs, "promotions"),
  validateSearch: discountsListFilters,
  search: { middlewares: [stripSearchParams(discountsListFilters.parse({}))] },
  component: lazyScreen(() => import("./discounts-list-page"), "DiscountsListPage"),
});

export const pricesPastReviewDeadlineReportRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports/prices-past-review-deadline",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeReports),
  validateSearch: reportPeriodSearch,
  search: {
    middlewares: [stripSearchParams(reportPeriodSearch.parse({}))],
  },
  component: lazyScreen(
    () => import("./prices-past-review-deadline-report-page"),
    "PricesPastReviewDeadlineReportPage",
  ),
});

export const legacyPricesRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "prices",
  validateSearch: pricesListFilters,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/products/prices", search });
  },
});

export const legacyDiscountsRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "discounts",
  validateSearch: discountsListFilters,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/products/promotions", search });
  },
});
