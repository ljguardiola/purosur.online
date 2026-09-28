import { createRoute, lazyRouteComponent, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { canManageProductsAndCategories } from "../access/backoffice-access";
import { catalogAreaRoute } from "../shell/catalog-area";
import { refuseWithout } from "../shell/signed-in-route";

export const productsListFilters = z.object({
  search: z.string().default("").catch(""),
  category: z.string().default("ALL").catch("ALL"),
  unit: z.enum(["ALL", "UNIT", "KG"]).default("ALL").catch("ALL"),
  status: z.enum(["active", "inactive", "all"]).default("active").catch("active"),
  sort: z.enum(["ascending", "descending"]).default("ascending").catch("ascending"),
});

export type ProductsListFilters = z.output<typeof productsListFilters>;

export const productsListRoute = createRoute({
  getParentRoute: () => catalogAreaRoute,
  path: "products",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canManageProductsAndCategories),
  validateSearch: productsListFilters,
  search: { middlewares: [stripSearchParams(productsListFilters.parse({}))] },
  component: lazyRouteComponent(() => import("./products-list-page"), "ProductsListPage"),
});

export const categoriesListFilters = z.object({
  search: z.string().default("").catch(""),
  sort: z.enum(["ascending", "descending"]).default("ascending").catch("ascending"),
});

export type CategoriesListFilters = z.output<typeof categoriesListFilters>;

export const categoriesListRoute = createRoute({
  getParentRoute: () => catalogAreaRoute,
  path: "categories",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canManageProductsAndCategories),
  validateSearch: categoriesListFilters,
  search: { middlewares: [stripSearchParams(categoriesListFilters.parse({}))] },
  component: lazyRouteComponent(() => import("./categories-list-page"), "CategoriesListPage"),
});
