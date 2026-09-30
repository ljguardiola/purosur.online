import { createRoute, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import {
  canPerformStockCounts,
  canSeeStockBalances,
  canSeeStockMovements,
} from "../access/backoffice-access";
import { lazyScreen } from "../shell/lazy-screen";
import { refuseWithout } from "../shell/signed-in-route";
import { stockAreaRoute } from "../shell/stock-area";

const PERIODS = ["7", "30", "90"] as const;

export const stockBalancesFilters = z.object({
  search: z.string().default("").catch(""),
  category: z.string().default("ALL").catch("ALL"),
  balance: z.enum(["all", "positive", "zero", "negative"]).default("all").catch("all"),
});

export type StockBalancesFilters = z.output<typeof stockBalancesFilters>;

export const stockCountsFilters = z.object({
  search: z.string().default("").catch(""),
  category: z.string().default("ALL").catch("ALL"),
  period: z.enum(PERIODS).default("30").catch("30"),
});

export type StockCountsFilters = z.output<typeof stockCountsFilters>;

export const stockMovementsFilters = z.object({
  search: z.string().default("").catch(""),
  reason: z.string().default("ALL").catch("ALL"),
  period: z.enum(PERIODS).default("30").catch("30"),
});

export type StockMovementsFilters = z.output<typeof stockMovementsFilters>;

export const stockBalancesRoute = createRoute({
  getParentRoute: () => stockAreaRoute,
  path: "inventory",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeStockBalances),
  validateSearch: stockBalancesFilters,
  search: { middlewares: [stripSearchParams(stockBalancesFilters.parse({}))] },
  component: lazyScreen(() => import("./stock-balances-page"), "StockBalancesPage"),
});

export const stockCountsRoute = createRoute({
  getParentRoute: () => stockAreaRoute,
  path: "inventory-counts",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canPerformStockCounts),
  validateSearch: stockCountsFilters,
  search: { middlewares: [stripSearchParams(stockCountsFilters.parse({}))] },
  component: lazyScreen(() => import("./stock-counts-page"), "StockCountsPage"),
});

export const stockMovementsRoute = createRoute({
  getParentRoute: () => stockAreaRoute,
  path: "inventory-adjustments",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeStockMovements),
  validateSearch: stockMovementsFilters,
  search: { middlewares: [stripSearchParams(stockMovementsFilters.parse({}))] },
  component: lazyScreen(() => import("./stock-movements-page"), "StockMovementsPage"),
});
