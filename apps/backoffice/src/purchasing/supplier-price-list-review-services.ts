import { createBrand } from "../platform/brand-creation-api";
import { createTag } from "../platform/tag-creation-api";
import type { ConfirmSupplierPriceListModalServices } from "./confirm-supplier-price-list-modal";
import type { CreateProductFromSupplierItemModalServices } from "./create-product-from-supplier-item-modal";
import type { DiscardSupplierPriceListModalServices } from "./discard-supplier-price-list-modal";
import type { EditSupplierPriceListRowPriceModalServices } from "./edit-supplier-price-list-row-price-modal";
import type { LinkSupplierItemModalServices } from "./link-supplier-item-modal";
import type { RemoveSupplierPriceListRowModalServices } from "./remove-supplier-price-list-row-modal";
import {
  fetchSupplierItemLinkChoices,
  fetchSupplierItemLinkProposal,
  fetchSupplierItemQuantityProposal,
} from "./supplier-item-links-api";
import {
  createProductFromSupplierItem,
  fetchProductCreationBrands,
  fetchProductCreationCategories,
  fetchProductCreationTags,
  generateSupplierItemInternalBarcode,
} from "./supplier-item-products-api";
import {
  confirmSupplierPriceList,
  discardSupplierPriceList,
  fetchSupplierPriceListAiCost,
  fetchSupplierPriceListReview,
  linkSupplierPriceListRow,
  markSupplierPriceListRowReviewed,
  removeSupplierPriceListRow,
  setSupplierPriceListRowPrice,
} from "./supplier-price-lists-api";

export type SupplierPriceListReviewScreenServices = {
  fetchSupplierPriceListReview: typeof fetchSupplierPriceListReview;
  fetchSupplierPriceListAiCost: typeof fetchSupplierPriceListAiCost;
  markSupplierPriceListRowReviewed: typeof markSupplierPriceListRowReviewed;
} & EditSupplierPriceListRowPriceModalServices &
  LinkSupplierItemModalServices &
  CreateProductFromSupplierItemModalServices &
  RemoveSupplierPriceListRowModalServices &
  ConfirmSupplierPriceListModalServices &
  DiscardSupplierPriceListModalServices;

export const defaultSupplierPriceListReviewScreenServices: SupplierPriceListReviewScreenServices = {
  fetchSupplierPriceListReview,
  fetchSupplierPriceListAiCost,
  setSupplierPriceListRowPrice,
  removeSupplierPriceListRow,
  markSupplierPriceListRowReviewed,
  linkSupplierPriceListRow,
  fetchSupplierItemLinkProposal,
  fetchSupplierItemLinkChoices,
  fetchSupplierItemQuantityProposal,
  createProductFromSupplierItem,
  fetchProductCreationCategories,
  fetchProductCreationBrands,
  fetchProductCreationTags,
  createBrand,
  createTag,
  generateInternalBarcode: generateSupplierItemInternalBarcode,
  confirmSupplierPriceList,
  discardSupplierPriceList,
};
