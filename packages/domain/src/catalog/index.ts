export { BRAND_NAME_MAX_LENGTH, isBrandNameTooLong } from "./model/brand-name.js";
export {
  CATEGORY_NAME_MAX_LENGTH,
  categoryNameLength,
  isCategoryNameTooLong,
} from "./model/category-name.js";
export {
  appendEan13CheckDigit,
  ean13CheckDigit,
  ean13Modules,
  isInternalBarcode,
} from "./model/ean13.js";
export type { BarcodeListProblem, NetContentUnit, SaleUnit } from "./model/product.js";
export {
  BARCODE_MAX_LENGTH,
  barcodeLength,
  barcodeListProblem,
  isBarcodeTooLong,
  isNetContentUnit,
  isProductNameTooLong,
  isValidNetContentQuantity,
  LABELS_MAX_COUNT_PER_PRODUCT,
  LABELS_MAX_TOTAL_COUNT,
  NET_CONTENT_QUANTITY_MAX,
  NET_CONTENT_QUANTITY_MAX_DECIMALS,
  NET_CONTENT_UNITS,
  PRODUCT_BARCODES_MAX_COUNT,
  PRODUCT_NAME_MAX_LENGTH,
  productNameLength,
  SALE_UNITS,
} from "./model/product.js";
export { isTagNameTooLong, TAG_NAME_MAX_LENGTH } from "./model/tag-name.js";
