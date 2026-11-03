import type { AddPurchaseLinesModalServices } from "./add-purchase-lines-modal";
import type { CorrectPurchaseHeaderModalServices } from "./correct-purchase-header-modal";
import type { CorrectPurchaseLineExpiryModalServices } from "./correct-purchase-line-expiry-modal";
import type { PurchaseChangesModalServices } from "./purchase-changes-modal";
import {
  addPurchaseLines,
  correctPurchaseHeader,
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
  CorrectPurchaseLineExpiryModalServices;

export const defaultPurchasesListScreenServices: PurchasesListScreenServices = {
  fetchPurchases,
  fetchPurchaseChanges,
  fetchPurchaseChoices,
  addPurchaseLines,
  correctPurchaseHeader,
  correctPurchaseLineExpiry,
};
