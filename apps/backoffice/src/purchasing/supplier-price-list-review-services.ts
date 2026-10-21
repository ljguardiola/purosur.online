import type { ConfirmSupplierPriceListModalServices } from "./confirm-supplier-price-list-modal";
import type { DiscardSupplierPriceListModalServices } from "./discard-supplier-price-list-modal";
import type { EditSupplierPriceListRowPriceModalServices } from "./edit-supplier-price-list-row-price-modal";
import type { RemoveSupplierPriceListRowModalServices } from "./remove-supplier-price-list-row-modal";
import {
  confirmSupplierPriceList,
  discardSupplierPriceList,
  fetchSupplierPriceListReview,
  removeSupplierPriceListRow,
  setSupplierPriceListRowPrice,
} from "./supplier-price-lists-api";

export type SupplierPriceListReviewScreenServices = {
  fetchSupplierPriceListReview: typeof fetchSupplierPriceListReview;
} & EditSupplierPriceListRowPriceModalServices &
  RemoveSupplierPriceListRowModalServices &
  ConfirmSupplierPriceListModalServices &
  DiscardSupplierPriceListModalServices;

export const defaultSupplierPriceListReviewScreenServices: SupplierPriceListReviewScreenServices = {
  fetchSupplierPriceListReview,
  setSupplierPriceListRowPrice,
  removeSupplierPriceListRow,
  confirmSupplierPriceList,
  discardSupplierPriceList,
};
