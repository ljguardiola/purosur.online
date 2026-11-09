import type { PagePart } from "../platform/page-parts";
import {
  type BackofficeAccess,
  canManageFreights,
  canRecordPurchases,
} from "../shell/backoffice-access";

export type PurchasesTab = "purchases" | "freights";

export const PURCHASES_TABS: readonly PagePart<BackofficeAccess, PurchasesTab>[] = [
  { key: "purchases", isVisibleTo: canRecordPurchases },
  { key: "freights", isVisibleTo: canManageFreights },
];

export const PURCHASES_TAB_TARGETS = {
  purchases: "/purchases",
  freights: "/purchases/freights",
} as const;
