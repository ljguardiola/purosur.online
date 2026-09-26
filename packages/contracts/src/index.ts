export type { AlertAudience, AlertKind, AlertLevel } from "./alert-catalog.js";
export { ALERT_KINDS, isAlertKind } from "./alert-catalog.js";
export { ARGENTINA_TIME_ZONE, argentinaCalendarDay } from "./argentina-calendar.js";
export { BRANCH_HOURS_RANGES_PER_DAY_MAX } from "./branch-hours.js";
export {
  CATEGORY_NAME_MAX_LENGTH,
  categoryNameLength,
  isCategoryNameTooLong,
} from "./category-name.js";
export type {
  CoreStatusMessage,
  MainHealthCheckMessage,
  MainToCoreMessage,
  RendererPingMessage,
  RendererToCoreMessage,
} from "./core-messages.js";
export {
  coreStatusMessageSchema,
  mainHealthCheckMessageSchema,
  mainToCoreMessageSchema,
  rendererPingMessageSchema,
  rendererToCoreMessageSchema,
} from "./core-messages.js";
export {
  appendEan13CheckDigit,
  ean13CheckDigit,
  ean13Modules,
  isInternalBarcode,
} from "./ean13.js";
export {
  ISSUER_IDENTIFICATION_GROSS_INCOME_REGISTRATION_MAX_LENGTH,
  ISSUER_IDENTIFICATION_LEGAL_NAME_MAX_LENGTH,
} from "./issuer-identification.js";
export type {
  PermissionArea,
  PermissionDefinition,
  PermissionKey,
  PermissionRegisterMarker,
} from "./permission-catalog.js";
export {
  ALERT_VIEW_PERMISSION_KEYS,
  isPermissionKey,
  PERMISSION_AREAS,
  PERMISSION_CATALOG,
  PERMISSION_KEYS,
} from "./permission-catalog.js";
export { MAX_UNIT_PRICE_CENTS } from "./price.js";
export type { NetContentUnit } from "./product.js";
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
} from "./product.js";
export {
  isRegisterNameTooLong,
  REGISTER_NAME_MAX_LENGTH,
  registerNameLength,
} from "./register-name.js";
export { isRoleNameTooLong, ROLE_NAME_MAX_LENGTH, roleNameLength } from "./role-name.js";
