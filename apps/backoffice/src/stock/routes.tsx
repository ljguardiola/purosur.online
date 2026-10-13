import { stockPeriodSchema } from "@purosur/contracts";
import { createRoute, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import {
  canPerformStockCounts,
  canRecordInitialInventory,
  canSeeExpiringLots,
  canSeeStockBalances,
  canSeeStockMovements,
} from "../shell/backoffice-access";
import { lazyScreen } from "../shell/lazy-screen";
import { refuseWithout } from "../shell/signed-in-route";
import { stockAreaRoute } from "../shell/stock-area";

const periodFilter = stockPeriodSchema.default(stockPeriodSchema.parse(undefined));

export const stockBalancesFilters = z.object({
  search: z.string().default("").catch(""),
  category: z.string().default("ALL").catch("ALL"),
  balance: z.enum(["all", "positive", "zero", "negative"]).default("all").catch("all"),
  sortBy: z
    .enum(["product", "balance", "unitCost", "value", "lots"])
    .default("product")
    .catch("product"),
  sort: z.enum(["ascending", "descending"]).default("ascending").catch("ascending"),
});

export type StockBalancesFilters = z.output<typeof stockBalancesFilters>;

export const stockCountsFilters = z.object({
  search: z.string().default("").catch(""),
  category: z.string().default("ALL").catch("ALL"),
  period: periodFilter,
  sortBy: z
    .enum(["date", "product", "expected", "counted", "difference"])
    .default("date")
    .catch("date"),
  sort: z.enum(["ascending", "descending"]).default("descending").catch("descending"),
});

export type StockCountsFilters = z.output<typeof stockCountsFilters>;

export const stockMovementsFilters = z.object({
  search: z.string().default("").catch(""),
  reason: z.string().default("ALL").catch("ALL"),
  period: periodFilter,
});

export type StockMovementsFilters = z.output<typeof stockMovementsFilters>;

export const initialInventoryFilters = z.object({
  search: z.string().default("").catch(""),
  cost: z.enum(["all", "known", "incomplete"]).default("all").catch("all"),
});

export type InitialInventoryFilters = z.output<typeof initialInventoryFilters>;

export const expiringLotsFilters = z.object({
  search: z.string().default("").catch(""),
  category: z.string().default("ALL").catch("ALL"),
  expiry: z.enum(["all", "expired", "upcoming"]).default("all").catch("all"),
});

export type ExpiringLotsFilters = z.output<typeof expiringLotsFilters>;

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

export const initialInventoryRoute = createRoute({
  getParentRoute: () => stockAreaRoute,
  path: "initial-inventory",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canRecordInitialInventory),
  validateSearch: initialInventoryFilters,
  search: { middlewares: [stripSearchParams(initialInventoryFilters.parse({}))] },
  component: lazyScreen(() => import("./initial-inventory-page"), "InitialInventoryPage"),
});

export const expiringLotsRoute = createRoute({
  getParentRoute: () => stockAreaRoute,
  path: "expiring-lots",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeExpiringLots),
  validateSearch: expiringLotsFilters,
  search: { middlewares: [stripSearchParams(expiringLotsFilters.parse({}))] },
  component: lazyScreen(() => import("./expiring-lots-page"), "ExpiringLotsPage"),
});
