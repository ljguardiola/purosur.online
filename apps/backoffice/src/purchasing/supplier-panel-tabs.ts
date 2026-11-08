import type { PagePart } from "../platform/page-parts";
import {
  type BackofficeAccess,
  canManageFreights,
  canManageSupplierPriceLists,
  canManageSuppliers,
  canReadPurchaseOrders,
  canRecordPurchases,
} from "../shell/backoffice-access";

export const SUPPLIER_PANEL_TAB_KEYS = [
  "data",
  "lists",
  "orders",
  "purchases",
  "freights",
] as const;

export type SupplierPanelTab = (typeof SUPPLIER_PANEL_TAB_KEYS)[number];

export const SUPPLIER_PANEL_TABS: readonly PagePart<BackofficeAccess, SupplierPanelTab>[] = [
  { key: "data", isVisibleTo: canManageSuppliers },
  { key: "lists", isVisibleTo: canManageSupplierPriceLists },
  { key: "orders", isVisibleTo: canReadPurchaseOrders },
  { key: "purchases", isVisibleTo: canRecordPurchases },
  { key: "freights", isVisibleTo: canManageFreights },
];
