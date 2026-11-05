import type { AddPurchaseLinesModalServices } from "./add-purchase-lines-modal";
import type { CorrectPurchaseHeaderModalServices } from "./correct-purchase-header-modal";
import type { CorrectPurchaseLineCostModalServices } from "./correct-purchase-line-cost-modal";
import type { CorrectPurchaseLineExpiryModalServices } from "./correct-purchase-line-expiry-modal";
import type { CorrectPurchaseLineQuantityModalServices } from "./correct-purchase-line-quantity-modal";
import type { PurchaseChangesModalServices } from "./purchase-changes-modal";
import {
  addPurchaseLines,
  correctPurchaseHeader,
  correctPurchaseLineCost,
  correctPurchaseLineExpiry,
  correctPurchaseLineQuantity,
  fetchPurchaseChanges,
  fetchPurchaseChoices,
  fetchPurchases,
  splitPurchaseLineExpiry,
} from "./purchases-api";
import type { SplitPurchaseLineExpiryModalServices } from "./split-purchase-line-expiry-modal";

export type PurchasesListScreenServices = {
  fetchPurchases: typeof fetchPurchases;
} & PurchaseChangesModalServices &
  AddPurchaseLinesModalServices &
  CorrectPurchaseHeaderModalServices &
  CorrectPurchaseLineExpiryModalServices &
  SplitPurchaseLineExpiryModalServices &
  CorrectPurchaseLineCostModalServices &
  CorrectPurchaseLineQuantityModalServices;

export const defaultPurchasesListScreenServices: PurchasesListScreenServices = {
  fetchPurchases,
  fetchPurchaseChanges,
  fetchPurchaseChoices,
  addPurchaseLines,
  correctPurchaseHeader,
  correctPurchaseLineExpiry,
  splitPurchaseLineExpiry,
  correctPurchaseLineCost,
  correctPurchaseLineQuantity,
};
