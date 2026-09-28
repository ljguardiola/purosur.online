export type {
  PermissionArea,
  PermissionDefinition,
  PermissionKey,
  PermissionRegisterMarker,
} from "./access/index.js";
export {
  ALERT_VIEW_PERMISSION_KEYS,
  isPasskeyNameTooLong,
  isPermissionKey,
  isRoleNameTooLong,
  PASSKEY_NAME_MAX_LENGTH,
  PERMISSION_AREAS,
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
  passkeyNameLength,
  ROLE_NAME_MAX_LENGTH,
  roleNameLength,
} from "./access/index.js";
export type { AlertAudience, AlertKind, AlertLevel } from "./alerts/index.js";
export { ALERT_KINDS, isAlertKind } from "./alerts/index.js";
export {
  BRANCH_HOURS_RANGES_PER_DAY_MAX,
  BRANCH_SETTINGS_DAYS_MAX,
} from "./branch/index.js";
export type {
  CatalogCategory,
  CatalogNetContent,
  CatalogProduct,
  CatalogStore,
  CatalogStoreTransaction,
  CategoryFields,
  CreateCategoryInput,
  CreateCategoryOutcome,
  CreateProductInput,
  CreateProductOutcome,
  DeactivateProductOutcome,
  EditCategoryInput,
  EditCategoryOutcome,
  EditProductInput,
  EditProductOutcome,
  LockCategoryResult,
  LockLeafCategoryResult,
  LockParentForNewChildResult,
  LockProductResult,
  NetContentUnit,
  NewProductFields,
  ProductFields,
  SaleUnit,
} from "./catalog/index.js";
export {
  appendEan13CheckDigit,
  BARCODE_MAX_LENGTH,
  barcodeLength,
  CATEGORY_NAME_MAX_LENGTH,
  CatalogBarcodeConflict,
  CatalogCategoryNameConflict,
  categoryNameLength,
  createCategory,
  createProduct,
  deactivateProduct,
  ean13CheckDigit,
  ean13Modules,
  editCategory,
  editProduct,
  isBarcodeTooLong,
  isCategoryNameTooLong,
  isInternalBarcode,
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
} from "./catalog/index.js";
export {
  ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH,
  ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH,
  isIssuerIdentificationGrossIncomeRegistrationTooLong,
  isIssuerIdentificationLegalNameTooLong,
} from "./fiscal/index.js";
export { MAX_UNIT_PRICE_CENTS } from "./pricing/index.js";
export {
  isRegisterNameTooLong,
  REGISTER_NAME_MAX_LENGTH,
  registerNameLength,
} from "./register/index.js";
export { ARGENTINA_TIME_ZONE, argentinaCalendarDay } from "./shared/index.js";
