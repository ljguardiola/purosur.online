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

const productsListSearch = productsListFilters.extend({
  product: z.string().optional().catch(undefined),
  tab: z.string().optional().catch(undefined),
});

export const productsListRoute = createRoute({
  getParentRoute: () => productsRoute,
  path: "/",
  beforeLoad: ({ context: { productsTabs } }) => productsTabRedirect(productsTabs, "products"),
  validateSearch: productsListSearch,
  search: { middlewares: [stripSearchParams(productsListFilters.parse({}))] },
  component: lazyScreen(() => import("./products-list-page"), "ProductsListPage"),
});

export const categoriesListFilters = z.object({
  search: z.string().default("").catch(""),
  sort: z.enum(["ascending", "descending"]).default("ascending").catch("ascending"),
});

export type CategoriesListFilters = z.output<typeof categoriesListFilters>;

export const brandsListFilters = z.object({
  search: z.string().default("").catch(""),
  status: z.enum(["active", "inactive", "all"]).default("active").catch("active"),
  sortBy: z.enum(["brand", "products"]).default("brand").catch("brand"),
  sort: z.enum(["ascending", "descending"]).default("ascending").catch("ascending"),
});

export type BrandsListFilters = z.output<typeof brandsListFilters>;

export const tagsListFilters = z.object({
  search: z.string().default("").catch(""),
  status: z.enum(["active", "inactive", "all"]).default("active").catch("active"),
  sortBy: z.enum(["tag", "products"]).default("tag").catch("tag"),
  sort: z.enum(["ascending", "descending"]).default("ascending").catch("ascending"),
});

export type TagsListFilters = z.output<typeof tagsListFilters>;

const classificationFilters = z.object({
  categorySearch: categoriesListFilters.shape.search,
  categorySort: categoriesListFilters.shape.sort,
  brandSearch: brandsListFilters.shape.search,
  brandStatus: brandsListFilters.shape.status,
  brandSortBy: brandsListFilters.shape.sortBy,
  brandSort: brandsListFilters.shape.sort,
  tagSearch: tagsListFilters.shape.search,
  tagStatus: tagsListFilters.shape.status,
  tagSortBy: tagsListFilters.shape.sortBy,
  tagSort: tagsListFilters.shape.sort,
});

const classificationSearch = classificationFilters.extend({
  search: z.string().optional().catch(undefined),
  sort: z.enum(["ascending", "descending"]).optional().catch(undefined),
});

export const classificationRoute = createRoute({
  getParentRoute: () => productsRoute,
  path: "classification",
  beforeLoad: ({ context: { productsTabs }, search: { search, sort, ...current } }) => {
    productsTabRedirect(productsTabs, "classification");
    if (search !== undefined || sort !== undefined) {
      throw redirect({
        to: "/products/classification",
        search: {
          ...current,
          ...(search === undefined ? {} : { categorySearch: search }),
          ...(sort === undefined ? {} : { categorySort: sort }),
        },
        replace: true,
      });
    }
  },
  validateSearch: classificationSearch,
  search: { middlewares: [stripSearchParams(classificationFilters.parse({}))] },
  component: lazyScreen(() => import("./classification-page"), "ClassificationPage"),
});

export const legacyClassificationBrandsRoute = createRoute({
  getParentRoute: () => productsRoute,
  path: "classification/brands",
  validateSearch: brandsListFilters,
  beforeLoad: ({ search: { search, status, sortBy, sort } }) => {
    throw redirect({
      to: "/products/classification",
      search: { brandSearch: search, brandStatus: status, brandSortBy: sortBy, brandSort: sort },
    });
  },
});

export const legacyClassificationTagsRoute = createRoute({
  getParentRoute: () => productsRoute,
  path: "classification/tags",
  validateSearch: tagsListFilters,
  beforeLoad: ({ search: { search, status, sortBy, sort } }) => {
    throw redirect({
      to: "/products/classification",
      search: { tagSearch: search, tagStatus: status, tagSortBy: sortBy, tagSort: sort },
    });
  },
});

export const legacyCategoriesRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "categories",
  validateSearch: categoriesListFilters,
  beforeLoad: ({ search: { search, sort } }) => {
    throw redirect({
      to: "/products/classification",
      search: { categorySearch: search, categorySort: sort },
    });
  },
});

export const legacyBrandsRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "brands",
  validateSearch: brandsListFilters,
  beforeLoad: ({ search: { search, status, sortBy, sort } }) => {
    throw redirect({
      to: "/products/classification",
      search: { brandSearch: search, brandStatus: status, brandSortBy: sortBy, brandSort: sort },
    });
  },
});

export const legacyTagsRoute = createRoute({
  getParentRoute: () => signedInRoute,
  path: "tags",
  validateSearch: tagsListFilters,
  beforeLoad: ({ search: { search, status, sortBy, sort } }) => {
    throw redirect({
      to: "/products/classification",
      search: { tagSearch: search, tagStatus: status, tagSortBy: sortBy, tagSort: sort },
    });
  },
});
