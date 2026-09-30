import { createRoute, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { canManagePromotions, canSeePricesArea } from "../access/backoffice-access";
import { catalogAreaRoute } from "../shell/catalog-area";
import { lazyScreen } from "../shell/lazy-screen";
import { refuseWithout } from "../shell/signed-in-route";

export const pricesListFilters = z.object({
  search: z.string().default("").catch(""),
  category: z.string().default("ALL").catch("ALL"),
  review: z.enum(["pending", "all"]).default("pending").catch("pending"),
});

export type PricesListFilters = z.output<typeof pricesListFilters>;

export const pricesListRoute = createRoute({
  getParentRoute: () => catalogAreaRoute,
  path: "prices",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeePricesArea),
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
  getParentRoute: () => catalogAreaRoute,
  path: "discounts",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canManagePromotions),
  validateSearch: discountsListFilters,
  search: { middlewares: [stripSearchParams(discountsListFilters.parse({}))] },
  component: lazyScreen(() => import("./discounts-list-page"), "DiscountsListPage"),
});
