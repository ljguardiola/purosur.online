import { fetchSupplierPriceLists, uploadSupplierPriceList } from "./supplier-price-lists-api";
import { fetchSuppliers } from "./suppliers-api";
import type { UploadSupplierPriceListModalServices } from "./upload-supplier-price-list-modal";

export type SupplierPriceListsScreenServices = {
  fetchSupplierPriceLists: typeof fetchSupplierPriceLists;
} & UploadSupplierPriceListModalServices;

export const defaultSupplierPriceListsScreenServices: SupplierPriceListsScreenServices = {
  fetchSupplierPriceLists,
  uploadSupplierPriceList,
  fetchSuppliers,
};
