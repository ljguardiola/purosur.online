import type { PagePart } from "../platform/page-parts";
import {
  type BackofficeAccess,
  canManageSupplierPriceLists,
  canManageSuppliers,
} from "../shell/backoffice-access";

export type SuppliersTab = "suppliers" | "price-lists";

export const SUPPLIERS_TABS: readonly PagePart<BackofficeAccess, SuppliersTab>[] = [
  { key: "suppliers", isVisibleTo: canManageSuppliers },
  { key: "price-lists", isVisibleTo: canManageSupplierPriceLists },
];

export const SUPPLIERS_TAB_TARGETS = {
  suppliers: "/suppliers",
  "price-lists": "/suppliers/price-lists",
} as const;
