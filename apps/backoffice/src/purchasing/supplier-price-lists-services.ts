import { type BranchTermServices, defaultBranchTermServices } from "../shell/branch-term-services";
import type { SupplierFilterServices } from "./purchasing-screen-parts";
import {
  fetchSupplierPriceLists,
  loadSupplierPriceListWebPage,
  refreshSupplierPriceList,
  uploadSupplierPriceList,
} from "./supplier-price-lists-api";
import { createSupplier, fetchSupplierName, fetchSuppliers } from "./suppliers-api";
import type { UploadSupplierPriceListModalServices } from "./upload-supplier-price-list-modal";

export type SupplierPriceListsScreenServices = {
  fetchSupplierPriceLists: typeof fetchSupplierPriceLists;
  refreshSupplierPriceList: typeof refreshSupplierPriceList;
  branchTerm: BranchTermServices;
} & SupplierFilterServices &
  UploadSupplierPriceListModalServices;

export const defaultSupplierPriceListsScreenServices: SupplierPriceListsScreenServices = {
  fetchSupplierPriceLists,
  fetchSupplierName,
  refreshSupplierPriceList,
  uploadSupplierPriceList,
  loadSupplierPriceListWebPage,
  fetchSuppliers,
  createSupplier,
  branchTerm: defaultBranchTermServices,
};
