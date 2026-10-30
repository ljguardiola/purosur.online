import {
  fetchSupplierPriceLists,
  loadSupplierPriceListWebPage,
  refreshSupplierPriceList,
  uploadSupplierPriceList,
} from "./supplier-price-lists-api";
import { createSupplier, fetchSuppliers } from "./suppliers-api";
import type { UploadSupplierPriceListModalServices } from "./upload-supplier-price-list-modal";

export type SupplierPriceListsScreenServices = {
  fetchSupplierPriceLists: typeof fetchSupplierPriceLists;
  refreshSupplierPriceList: typeof refreshSupplierPriceList;
} & UploadSupplierPriceListModalServices;

export const defaultSupplierPriceListsScreenServices: SupplierPriceListsScreenServices = {
  fetchSupplierPriceLists,
  refreshSupplierPriceList,
  uploadSupplierPriceList,
  loadSupplierPriceListWebPage,
  fetchSuppliers,
  createSupplier,
};
