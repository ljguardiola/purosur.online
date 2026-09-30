import { createRoute, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { canManageProductsAndCategories } from "../access/backoffice-access";
import { catalogAreaRoute } from "../shell/catalog-area";
import { lazyScreen } from "../shell/lazy-screen";
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
  component: lazyScreen(() => import("./products-list-page"), "ProductsListPage"),
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
  component: lazyScreen(() => import("./categories-list-page"), "CategoriesListPage"),
});

export const brandsListFilters = z.object({
  search: z.string().default("").catch(""),
  status: z.enum(["active", "inactive", "all"]).default("active").catch("active"),
  sortBy: z.enum(["brand", "products"]).default("brand").catch("brand"),
  sort: z.enum(["ascending", "descending"]).default("ascending").catch("ascending"),
});

export type BrandsListFilters = z.output<typeof brandsListFilters>;

export const brandsListRoute = createRoute({
  getParentRoute: () => catalogAreaRoute,
  path: "brands",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canManageProductsAndCategories),
  validateSearch: brandsListFilters,
  search: { middlewares: [stripSearchParams(brandsListFilters.parse({}))] },
  component: lazyScreen(() => import("./brands-list-page"), "BrandsListPage"),
});

export const tagsListFilters = z.object({
  search: z.string().default("").catch(""),
  status: z.enum(["active", "inactive", "all"]).default("active").catch("active"),
  sortBy: z.enum(["tag", "products"]).default("tag").catch("tag"),
  sort: z.enum(["ascending", "descending"]).default("ascending").catch("ascending"),
});

export type TagsListFilters = z.output<typeof tagsListFilters>;

export const tagsListRoute = createRoute({
  getParentRoute: () => catalogAreaRoute,
  path: "tags",
  beforeLoad: ({ context: { session } }) => refuseWithout(session, canManageProductsAndCategories),
  validateSearch: tagsListFilters,
  search: { middlewares: [stripSearchParams(tagsListFilters.parse({}))] },
  component: lazyScreen(() => import("./tags-list-page"), "TagsListPage"),
});
