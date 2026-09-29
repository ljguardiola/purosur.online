import { createRoute, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { canSeePricesArea } from "../access/backoffice-access";
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
