import type { PagePart } from "../platform/page-parts";
import {
  type BackofficeAccess,
  canManageProductsAndCategories,
  canManagePromotions,
  canManageRecipes,
  canSeePricesArea,
} from "./backoffice-access";

export type ProductsTab = "products" | "prices" | "promotions" | "assemblies" | "classification";

export const PRODUCTS_TABS: readonly PagePart<BackofficeAccess, ProductsTab>[] = [
  { key: "products", isVisibleTo: canManageProductsAndCategories },
  { key: "prices", isVisibleTo: canSeePricesArea },
  { key: "promotions", isVisibleTo: canManagePromotions },
  { key: "assemblies", isVisibleTo: canManageRecipes },
  { key: "classification", isVisibleTo: canManageProductsAndCategories },
];

export const PRODUCTS_TAB_TARGETS = {
  products: "/products",
  prices: "/products/prices",
  promotions: "/products/promotions",
  assemblies: "/products/assemblies",
  classification: "/products/classification",
} as const;
