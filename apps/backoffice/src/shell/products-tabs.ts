import type { PagePart } from "../platform/page-parts";
import {
  type BackofficeAccess,
  canManageBatches,
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
  {
    key: "assemblies",
    isVisibleTo: (access) => canManageRecipes(access) || canManageBatches(access),
  },
  { key: "classification", isVisibleTo: canManageProductsAndCategories },
];

export const PRODUCTS_TAB_TARGETS = {
  products: "/products",
  prices: "/products/prices",
  promotions: "/products/promotions",
  assemblies: "/products/assemblies",
  classification: "/products/classification",
} as const;
