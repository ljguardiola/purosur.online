import { createRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { lazyScreen } from "../shell/lazy-screen";
import { productsRoute, productsTabRedirect } from "../shell/products-route";
import {
  reportFiltersFields,
  reportPeriodSearch,
  withoutRefusedPeriod,
} from "../shell/report-filters-search";
import { signedInRoute } from "../shell/signed-in-route";

export const pricesListFilters = z
  .object({
    search: z.string().default("").catch(""),
    category: z.string().default("ALL").catch("ALL"),
    review: z.enum(["pending", "overdue", "all"]).default("pending").catch("pending"),
    from: reportFiltersFields.from,
    to: reportFiltersFields.to,
  })
  .transform(withoutRefusedPeriod)
  .transform((filters) =>
    filters.review === "pending" && filters.from !== ""
      ? { ...filters, search: "", category: "ALL" }
      : filters,
  );

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

export const legacyPricesPastReviewDeadlineReportRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "reports/prices-past-review-deadline",
  validateSearch: reportPeriodSearch,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/products/prices", search: { ...search, review: "pending" } });
  },
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
