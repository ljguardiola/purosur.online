import type { AddPurchaseLinesModalServices } from "./add-purchase-lines-modal";
import type { CorrectPurchaseHeaderModalServices } from "./correct-purchase-header-modal";
import type { CorrectPurchaseLineCostModalServices } from "./correct-purchase-line-cost-modal";
import type { CorrectPurchaseLineExpiryModalServices } from "./correct-purchase-line-expiry-modal";
import type { PurchaseChangesModalServices } from "./purchase-changes-modal";
import {
  addPurchaseLines,
  correctPurchaseHeader,
  correctPurchaseLineCost,
  correctPurchaseLineExpiry,
  fetchPurchaseChanges,
  fetchPurchaseChoices,
  fetchPurchases,
} from "./purchases-api";

export type PurchasesListScreenServices = {
  fetchPurchases: typeof fetchPurchases;
} & PurchaseChangesModalServices &
  AddPurchaseLinesModalServices &
  CorrectPurchaseHeaderModalServices &
  CorrectPurchaseLineExpiryModalServices &
  CorrectPurchaseLineCostModalServices;

export const defaultPurchasesListScreenServices: PurchasesListScreenServices = {
  fetchPurchases,
  fetchPurchaseChanges,
  fetchPurchaseChoices,
  addPurchaseLines,
  correctPurchaseHeader,
  correctPurchaseLineExpiry,
  correctPurchaseLineCost,
};
