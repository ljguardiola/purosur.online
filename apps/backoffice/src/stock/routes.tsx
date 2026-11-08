import { stockPeriodSchema } from "@purosur/contracts";
import { createRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import {
  canManageBatches,
  canManageRecipes,
  canSeeReports,
  canSeeStockPage,
} from "../shell/backoffice-access";
import { lazyScreen } from "../shell/lazy-screen";
import { productsRoute, productsTabRedirect } from "../shell/products-route";
import {
  reportFiltersFields,
  reportPeriodSearch,
  withoutRefusedPeriod,
} from "../shell/report-filters-search";
import { reportsAreaRoute } from "../shell/reports-area";
import { refuseWithout, signedInRoute } from "../shell/signed-in-route";
import { stockAreaRoute } from "../shell/stock-area";
import { ASSEMBLIES_SECTION_TARGETS, ASSEMBLIES_SECTIONS } from "./assemblies-sections";
import { currentStockReportFilters } from "./current-stock-report-filters";
import { marginReportFilters } from "./margin-report-filters";
import { STOCK_TAB_TARGETS, STOCK_TABS, type StockTab } from "./stock-tabs";

const periodFilter = stockPeriodSchema.default(stockPeriodSchema.parse(undefined));

const stockRegisterSearch = z.object({
  register: z.enum(["initial-inventory"]).optional().catch(undefined),
});

export const stockRoute = createRoute({
  getParentRoute: () => stockAreaRoute,
  path: "stock",
  validateSearch: stockRegisterSearch,
  beforeLoad: ({ context: { session } }) => {
    refuseWithout(session, canSeeStockPage);
    return {
      stockTabs: STOCK_TABS.filter((tab) => tab.isVisibleTo(session)).map((tab) => tab.key),
    };
  },
  component: lazyScreen(() => import("./stock-page"), "StockPage"),
});

function stockTabRedirect(
  stockTabs: readonly StockTab[],
  own: StockTab,
  { register }: z.output<typeof stockRegisterSearch>,
): void {
  const [first] = stockTabs;
  if (stockTabs.includes(own) || (first === undefined && own === "balances")) {
    return;
  }
  throw redirect({
    to: first === undefined ? "/stock" : STOCK_TAB_TARGETS[first],
    search: register === undefined ? {} : { register },
  });
}

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

export const stockMovementsFilters = z.object({
  search: z.string().default("").catch(""),
  reason: z.string().default("ALL").catch("ALL"),
  period: periodFilter,
});

const stockMovementKind = z.enum(["count", "adjustment", "loss"]);

const stockMovementKinds = z
  .union([
    z.array(stockMovementKind),
    z
      .string()
      .transform((text) => text.split(","))
      .pipe(z.array(stockMovementKind)),
  ])
  .default([])
  .catch([]);

export const stockMovementsSearch = stockMovementsFilters
  .extend({
    type: stockMovementKinds,
    view: z.enum(["list", "reason"]).default("list").catch("list"),
    from: reportFiltersFields.from,
    to: reportFiltersFields.to,
    sort: z.enum(["ascending", "descending"]).default("descending").catch("descending"),
  })
  .extend(stockRegisterSearch.shape)
  .transform(withoutRefusedPeriod);

export type StockMovementsSearchFilters = Omit<z.output<typeof stockMovementsSearch>, "register">;

const stockBalancesSearch = stockBalancesFilters
  .extend({ product: z.string().optional().catch(undefined) })
  .extend(stockRegisterSearch.shape);

export const initialInventoryFilters = z.object({
  search: z.string().default("").catch(""),
  cost: z.enum(["all", "known", "incomplete"]).default("all").catch("all"),
});

export const expiringLotsFilters = z
  .object({
    search: z.string().default("").catch(""),
    category: z.string().default("ALL").catch("ALL"),
    expiry: z.enum(["all", "expired", "upcoming"]).default("all").catch("all"),
    from: reportFiltersFields.from,
    to: reportFiltersFields.to,
  })
  .transform(withoutRefusedPeriod);

export type ExpiringLotsFilters = z.output<typeof expiringLotsFilters>;
export const recipesListFilters = z.object({
  search: z.string().default("").catch(""),
  sort: z.enum(["ascending", "descending"]).default("ascending").catch("ascending"),
});

export const assemblyBatchesFilters = z.object({
  search: z.string().default("").catch(""),
  period: periodFilter,
});

export type AssemblyBatchesFilters = z.output<typeof assemblyBatchesFilters>;

export type RecipesListFilters = z.output<typeof recipesListFilters>;

const recipesListSearch = recipesListFilters.extend({
  recipe: z.string().optional().catch(undefined),
});

export const stockBalancesRoute = createRoute({
  getParentRoute: () => stockRoute,
  path: "/",
  beforeLoad: ({ context: { stockTabs }, search }) =>
    stockTabRedirect(stockTabs, "balances", search),
  validateSearch: stockBalancesSearch,
  search: { middlewares: [stripSearchParams(stockBalancesFilters.parse({}))] },
  component: lazyScreen(() => import("./stock-balances-page"), "StockBalancesPage"),
});

export const currentStockReportRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports/current-stock",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeReports),
  validateSearch: currentStockReportFilters,
  search: { middlewares: [stripSearchParams(currentStockReportFilters.parse({}))] },
  component: lazyScreen(() => import("./current-stock-report-page"), "CurrentStockReportPage"),
});

export const expiringLotsReportRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports/expiring-lots",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeReports),
  validateSearch: reportPeriodSearch,
  search: { middlewares: [stripSearchParams(reportPeriodSearch.parse({}))] },
  component: lazyScreen(() => import("./expiring-lots-report-page"), "ExpiringLotsReportPage"),
});

export const lossesByReasonReportRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports/losses-by-reason",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeReports),
  validateSearch: reportPeriodSearch,
  search: { middlewares: [stripSearchParams(reportPeriodSearch.parse({}))] },
  component: lazyScreen(() => import("./losses-by-reason-report-page"), "LossesByReasonReportPage"),
});

export const marginReportRoute = createRoute({
  getParentRoute: () => reportsAreaRoute,
  path: "reports/margin",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canSeeReports),
  validateSearch: marginReportFilters,
  search: { middlewares: [stripSearchParams(marginReportFilters.parse({}))] },
  component: lazyScreen(() => import("./margin-report-page"), "MarginReportPage"),
});

export const stockMovementsRoute = createRoute({
  getParentRoute: () => stockRoute,
  path: "movements",
  beforeLoad: ({ context: { stockTabs }, search }) =>
    stockTabRedirect(stockTabs, "movements", search),
  validateSearch: stockMovementsSearch,
  search: {
    middlewares: [
      stripSearchParams({
        ...stockMovementsFilters.parse({}),
        type: [],
        view: "list",
        from: "",
        to: "",
        sort: "descending",
      }),
    ],
  },
  component: lazyScreen(() => import("./stock-movements-page"), "StockMovementsPage"),
});

export const expiringLotsRoute = createRoute({
  getParentRoute: () => stockRoute,
  path: "expiries",
  beforeLoad: ({ context: { stockTabs }, search }) =>
    stockTabRedirect(stockTabs, "expiries", search),
  validateSearch: expiringLotsFilters,
  search: { middlewares: [stripSearchParams(expiringLotsFilters.parse({}))] },
  component: lazyScreen(() => import("./expiring-lots-page"), "ExpiringLotsPage"),
});

export const legacyStockBalancesRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "inventory",
  validateSearch: stockBalancesFilters,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/stock", search });
  },
});

export const legacyExpiringLotsRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "expiring-lots",
  validateSearch: expiringLotsFilters,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/stock/expiries", search });
  },
});

export const legacyStockCountsRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "inventory-counts",
  validateSearch: stockCountsFilters,
  beforeLoad: ({ search: { search, period } }) => {
    throw redirect({ to: "/stock/movements", search: { search, period, type: ["count"] } });
  },
});

export const legacyStockMovementsRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "inventory-adjustments",
  validateSearch: stockMovementsFilters,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/stock/movements", search: { ...search, type: ["adjustment", "loss"] } });
  },
});

export const legacyInitialInventoryRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "initial-inventory",
  validateSearch: initialInventoryFilters,
  beforeLoad: ({ search: { search } }) => {
    throw redirect({ to: "/stock", search: { search, register: "initial-inventory" } });
  },
});

export const assembliesRoute = createRoute({
  getParentRoute: () => productsRoute,
  path: "assemblies",
  beforeLoad: ({ context: { productsTabs, session } }) => {
    productsTabRedirect(productsTabs, "assemblies");
    return {
      assembliesSections: ASSEMBLIES_SECTIONS.filter((section) => section.isVisibleTo(session)).map(
        (section) => section.key,
      ),
    };
  },
  component: lazyScreen(() => import("./assemblies-layout"), "AssembliesLayout"),
});

export const recipesListRoute = createRoute({
  getParentRoute: () => assembliesRoute,
  path: "/",
  beforeLoad: ({ context: { session } }) => {
    if (!canManageRecipes(session)) {
      throw redirect({ to: ASSEMBLIES_SECTION_TARGETS.batches });
    }
  },
  validateSearch: recipesListSearch,
  search: { middlewares: [stripSearchParams(recipesListFilters.parse({}))] },
  component: lazyScreen(() => import("./recipes-list-page"), "RecipesListPage"),
});

export const assemblyBatchesRoute = createRoute({
  getParentRoute: () => assembliesRoute,
  path: "batches",
  beforeLoad: ({ context: { session } }) => {
    if (!canManageBatches(session)) {
      throw redirect({ to: ASSEMBLIES_SECTION_TARGETS.recipes });
    }
  },
  validateSearch: assemblyBatchesFilters,
  search: { middlewares: [stripSearchParams(assemblyBatchesFilters.parse({}))] },
  component: lazyScreen(() => import("./assembly-batches-page"), "AssemblyBatchesPage"),
});

export const legacyRecipesRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "recipes",
  validateSearch: recipesListFilters,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/products/assemblies", search });
  },
});

export const legacyAssemblyBatchesRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "assembly-batches",
  validateSearch: assemblyBatchesFilters,
  beforeLoad: ({ context: { session }, search }) => {
    throw redirect(
      canManageBatches(session)
        ? { to: ASSEMBLIES_SECTION_TARGETS.batches, search }
        : { to: ASSEMBLIES_SECTION_TARGETS.recipes },
    );
  },
});
