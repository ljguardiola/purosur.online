import type { AddPurchaseLinesModalServices } from "./add-purchase-lines-modal";
import type { CorrectPurchaseHeaderModalServices } from "./correct-purchase-header-modal";
import type { PurchaseChangesModalServices } from "./purchase-changes-modal";
import type { PurchasePanelServices } from "./purchase-panel-services";
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
import { fetchPurchasesReport } from "./purchases-report-api";
import type { PurchasesReportContentServices } from "./purchases-report-content-services";
import type { SupplierFilterServices } from "./purchasing-screen-parts";
import { fetchSupplierName } from "./suppliers-api";

export type PurchasesListScreenServices = {
  fetchPurchases: typeof fetchPurchases;
} & PurchasesReportContentServices &
  SupplierFilterServices &
  PurchaseChangesModalServices &
  AddPurchaseLinesModalServices &
  CorrectPurchaseHeaderModalServices &
  PurchasePanelServices;

export const defaultPurchasesListScreenServices: PurchasesListScreenServices = {
  fetchPurchases,
  fetchPurchasesReport,
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
