import type { AreaTabPart } from "../shell/area-tabs";
import {
  PURCHASE_ORDERS_TAB_TARGETS,
  PURCHASE_ORDERS_TABS,
  type PurchaseOrdersTab,
} from "./purchase-orders-tabs";
import { PURCHASES_TAB_TARGETS, PURCHASES_TABS, type PurchasesTab } from "./purchases-tabs";
import { SUPPLIERS_TAB_TARGETS, SUPPLIERS_TABS, type SuppliersTab } from "./suppliers-tabs";

export type PurchasingTab = SuppliersTab | PurchaseOrdersTab | PurchasesTab;

const TAB_LABELS: Record<PurchasingTab, string> = {
  suppliers: "Proveedores",
  "price-lists": "Listas de precios",
  orders: "Pedidos",
  suggestion: "Sugerir pedido",
  comparison: "Comparar precios",
  purchases: "Compras registradas",
  freights: "Fletes",
};

const TAB_TARGETS = {
  ...SUPPLIERS_TAB_TARGETS,
  ...PURCHASE_ORDERS_TAB_TARGETS,
  ...PURCHASES_TAB_TARGETS,
} as const;

export const PURCHASING_TABS: readonly AreaTabPart<PurchasingTab>[] = [
  ...SUPPLIERS_TABS,
  ...PURCHASE_ORDERS_TABS,
  ...PURCHASES_TABS,
].map((part) => ({ ...part, label: TAB_LABELS[part.key], to: TAB_TARGETS[part.key] }));
