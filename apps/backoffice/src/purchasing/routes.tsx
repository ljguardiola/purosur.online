import { freightPeriodSchema } from "@purosur/contracts";
import { createRoute, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import {
  canManageFreights,
  canManagePurchasePackagings,
  canManageSuppliers,
  canRecordPurchases,
} from "../shell/backoffice-access";
import { lazyScreen } from "../shell/lazy-screen";
import { refuseWithout } from "../shell/signed-in-route";
import { stockAreaRoute } from "../shell/stock-area";

export const suppliersListFilters = z.object({
  search: z.string().default("").catch(""),
  status: z.enum(["active", "inactive", "all"]).default("active").catch("active"),
  sort: z.enum(["ascending", "descending"]).default("ascending").catch("ascending"),
});

export type SuppliersListFilters = z.output<typeof suppliersListFilters>;

export const suppliersListRoute = createRoute({
  getParentRoute: () => stockAreaRoute,
  path: "suppliers",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canManageSuppliers),
  validateSearch: suppliersListFilters,
  search: { middlewares: [stripSearchParams(suppliersListFilters.parse({}))] },
  component: lazyScreen(() => import("./suppliers-list-page"), "SuppliersListPage"),
});

export const packagingsListFilters = z.object({
  search: z.string().default("").catch(""),
  status: z.enum(["active", "inactive", "all"]).default("active").catch("active"),
  sort: z.enum(["ascending", "descending"]).default("ascending").catch("ascending"),
});

export type PackagingsListFilters = z.output<typeof packagingsListFilters>;

export const packagingsListRoute = createRoute({
  getParentRoute: () => stockAreaRoute,
  path: "purchase-packagings",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canManagePurchasePackagings),
  validateSearch: packagingsListFilters,
  search: { middlewares: [stripSearchParams(packagingsListFilters.parse({}))] },
  component: lazyScreen(() => import("./packagings-list-page"), "PackagingsListPage"),
});

export const purchasesListRoute = createRoute({
  getParentRoute: () => stockAreaRoute,
  path: "purchases",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canRecordPurchases),
  component: lazyScreen(() => import("./purchases-list-page"), "PurchasesListPage"),
});

export const newPurchaseRoute = createRoute({
  getParentRoute: () => stockAreaRoute,
  path: "purchases/new",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canRecordPurchases),
  component: lazyScreen(() => import("./new-purchase-page"), "NewPurchasePage"),
});

export const freightsListFilters = z.object({
  search: z.string().default("").catch(""),
  period: freightPeriodSchema.catch(freightPeriodSchema.parse(undefined)),
});

export type FreightsListFilters = z.output<typeof freightsListFilters>;

export const freightsListRoute = createRoute({
  getParentRoute: () => stockAreaRoute,
  path: "freights",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canManageFreights),
  validateSearch: freightsListFilters,
  search: { middlewares: [stripSearchParams(freightsListFilters.parse({}))] },
  component: lazyScreen(() => import("./freights-list-page"), "FreightsListPage"),
});
