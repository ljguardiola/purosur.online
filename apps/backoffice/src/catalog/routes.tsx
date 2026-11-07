import { createRoute, redirect, stripSearchParams } from "@tanstack/react-router";
import { z } from "zod";
import { lazyScreen } from "../shell/lazy-screen";
import { productsRoute, productsTabRedirect } from "../shell/products-route";
import { signedInRoute } from "../shell/signed-in-route";

export const productsListFilters = z.object({
  search: z.string().default("").catch(""),
  category: z.string().default("ALL").catch("ALL"),
  brand: z.string().default("ALL").catch("ALL"),
  unit: z.enum(["ALL", "UNIT", "KG"]).default("ALL").catch("ALL"),
  status: z.enum(["active", "inactive", "all"]).default("active").catch("active"),
  sort: z.enum(["ascending", "descending"]).default("ascending").catch("ascending"),
});

export type ProductsListFilters = z.output<typeof productsListFilters>;

export const productsListRoute = createRoute({
  getParentRoute: () => productsRoute,
  path: "/",
  beforeLoad: ({ context: { productsTabs } }) => productsTabRedirect(productsTabs, "products"),
  validateSearch: productsListFilters,
  search: { middlewares: [stripSearchParams(productsListFilters.parse({}))] },
  component: lazyScreen(() => import("./products-list-page"), "ProductsListPage"),
});

export const classificationRoute = createRoute({
  getParentRoute: () => productsRoute,
  path: "classification",
  beforeLoad: ({ context: { productsTabs } }) =>
    productsTabRedirect(productsTabs, "classification"),
  component: lazyScreen(() => import("./classification-layout"), "ClassificationLayout"),
});

export const categoriesListFilters = z.object({
  search: z.string().default("").catch(""),
  sort: z.enum(["ascending", "descending"]).default("ascending").catch("ascending"),
});

export type CategoriesListFilters = z.output<typeof categoriesListFilters>;

export const categoriesListRoute = createRoute({
  getParentRoute: () => classificationRoute,
  path: "/",
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
  getParentRoute: () => classificationRoute,
  path: "brands",
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
  getParentRoute: () => classificationRoute,
  path: "tags",
  validateSearch: tagsListFilters,
  search: { middlewares: [stripSearchParams(tagsListFilters.parse({}))] },
  component: lazyScreen(() => import("./tags-list-page"), "TagsListPage"),
});

export const legacyCategoriesRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "categories",
  validateSearch: categoriesListFilters,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/products/classification", search });
  },
});

export const legacyBrandsRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "brands",
  validateSearch: brandsListFilters,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/products/classification/brands", search });
  },
});

export const legacyTagsRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "tags",
  validateSearch: tagsListFilters,
  beforeLoad: ({ search }) => {
    throw redirect({ to: "/products/classification/tags", search });
  },
});
