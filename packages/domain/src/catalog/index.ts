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
export type { NetContentUnit, SaleUnit } from "./model/product.js";
export {
  BARCODE_MAX_LENGTH,
  barcodeLength,
  isBarcodeTooLong,
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
} from "./model/product.js";
export type {
  CatalogCategory,
  CatalogNetContent,
  CatalogProduct,
  CatalogStore,
  CatalogStoreTransaction,
  CategoryFields,
  LockCategoryResult,
  LockLeafCategoryResult,
  LockParentForNewChildResult,
  LockProductResult,
  NewProductFields,
  ProductFields,
} from "./use-cases/catalog-store.js";
export {
  CatalogBarcodeConflict,
  CatalogCategoryNameConflict,
} from "./use-cases/catalog-store.js";
export type { CreateProductInput, CreateProductOutcome } from "./use-cases/create-product.js";
export { createProduct } from "./use-cases/create-product.js";
export type { DeactivateProductOutcome } from "./use-cases/deactivate-product.js";
export { deactivateProduct } from "./use-cases/deactivate-product.js";
export type { EditProductInput, EditProductOutcome } from "./use-cases/edit-product.js";
export { editProduct } from "./use-cases/edit-product.js";
