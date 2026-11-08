import type { AddPurchaseLinesModalServices } from "./add-purchase-lines-modal";
import type { ChangePurchaseLineProductModalServices } from "./change-purchase-line-product-modal";
import type { CorrectPurchaseHeaderModalServices } from "./correct-purchase-header-modal";
import type { CorrectPurchaseLineCostModalServices } from "./correct-purchase-line-cost-modal";
import type { CorrectPurchaseLineExpiryModalServices } from "./correct-purchase-line-expiry-modal";
import type { CorrectPurchaseLineQuantityModalServices } from "./correct-purchase-line-quantity-modal";
import type { PurchaseChangesModalServices } from "./purchase-changes-modal";
import {
  addPurchaseLines,
  changePurchaseLineProduct,
  correctPurchaseHeader,
  correctPurchaseLineCost,
  correctPurchaseLineExpiry,
  correctPurchaseLineQuantity,
  fetchPurchaseChanges,
  fetchPurchaseChoices,
  fetchPurchases,
  removePurchaseLine,
  splitPurchaseLineExpiry,
} from "./purchases-api";
import type { SupplierFilterServices } from "./purchasing-screen-parts";
import type { RemovePurchaseLineModalServices } from "./remove-purchase-line-modal";
import type { SplitPurchaseLineExpiryModalServices } from "./split-purchase-line-expiry-modal";
import { fetchSupplierName } from "./suppliers-api";

export type PurchasesListScreenServices = {
  fetchPurchases: typeof fetchPurchases;
} & SupplierFilterServices &
  PurchaseChangesModalServices &
  AddPurchaseLinesModalServices &
  CorrectPurchaseHeaderModalServices &
  CorrectPurchaseLineExpiryModalServices &
  SplitPurchaseLineExpiryModalServices &
  CorrectPurchaseLineCostModalServices &
  CorrectPurchaseLineQuantityModalServices &
  ChangePurchaseLineProductModalServices &
  RemovePurchaseLineModalServices;

export const defaultPurchasesListScreenServices: PurchasesListScreenServices = {
  fetchPurchases,
  fetchSupplierName,
  fetchPurchaseChanges,
  fetchPurchaseChoices,
  addPurchaseLines,
  correctPurchaseHeader,
  correctPurchaseLineExpiry,
  splitPurchaseLineExpiry,
  correctPurchaseLineCost,
  correctPurchaseLineQuantity,
  changePurchaseLineProduct,
  removePurchaseLine,
};
