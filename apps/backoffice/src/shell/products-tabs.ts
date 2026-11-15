import type { PagePart } from "../platform/page-parts";
import {
  type BackofficeAccess,
  canManageBatches,
  canManageProductsAndCategories,
  canManagePromotions,
  canManageRecipes,
  canSeePricesArea,
} from "./backoffice-access";

export type ProductsTab =
  | "products"
  | "prices"
  | "promotions"
  | "recipes"
  | "batches"
  | "classification";

export const PRODUCTS_TABS: readonly PagePart<BackofficeAccess, ProductsTab>[] = [
  { key: "products", isVisibleTo: canManageProductsAndCategories },
  { key: "prices", isVisibleTo: canSeePricesArea },
  { key: "promotions", isVisibleTo: canManagePromotions },
  { key: "recipes", isVisibleTo: canManageRecipes },
  { key: "batches", isVisibleTo: canManageBatches },
  { key: "classification", isVisibleTo: canManageProductsAndCategories },
];

export const PRODUCTS_TAB_TARGETS = {
  products: "/products",
  prices: "/products/prices",
  promotions: "/products/promotions",
  recipes: "/products/recipes",
  batches: "/products/batches",
  classification: "/products/classification",
} as const;
