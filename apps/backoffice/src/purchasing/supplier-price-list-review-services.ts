import type { ConfirmSupplierPriceListModalServices } from "./confirm-supplier-price-list-modal";
import type { DiscardSupplierPriceListModalServices } from "./discard-supplier-price-list-modal";
import type { EditSupplierPriceListRowPriceModalServices } from "./edit-supplier-price-list-row-price-modal";
import type { LinkSupplierItemModalServices } from "./link-supplier-item-modal";
import { createPackaging } from "./packagings-api";
import type { RemoveSupplierPriceListRowModalServices } from "./remove-supplier-price-list-row-modal";
import {
  fetchSupplierItemLinkChoices,
  fetchSupplierItemLinkProposal,
} from "./supplier-item-links-api";
import {
  confirmSupplierPriceList,
  discardSupplierPriceList,
  fetchSupplierPriceListReview,
  linkSupplierPriceListRow,
  markSupplierPriceListRowReviewed,
  removeSupplierPriceListRow,
  setSupplierPriceListRowPrice,
} from "./supplier-price-lists-api";

export type SupplierPriceListReviewScreenServices = {
  fetchSupplierPriceListReview: typeof fetchSupplierPriceListReview;
  markSupplierPriceListRowReviewed: typeof markSupplierPriceListRowReviewed;
} & EditSupplierPriceListRowPriceModalServices &
  LinkSupplierItemModalServices &
  RemoveSupplierPriceListRowModalServices &
  ConfirmSupplierPriceListModalServices &
  DiscardSupplierPriceListModalServices;

export const defaultSupplierPriceListReviewScreenServices: SupplierPriceListReviewScreenServices = {
  fetchSupplierPriceListReview,
  setSupplierPriceListRowPrice,
  removeSupplierPriceListRow,
  markSupplierPriceListRowReviewed,
  linkSupplierPriceListRow,
  fetchSupplierItemLinkProposal,
  fetchSupplierItemLinkChoices,
  createPackaging,
  confirmSupplierPriceList,
  discardSupplierPriceList,
};
