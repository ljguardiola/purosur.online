import {
  isValidDiscountBuyNPayM,
  isValidDiscountPercent,
  MERCADO_PAGO_PAYMENT_METHODS,
  manualAdjustmentReason,
  mayBeManualDiscountAmount,
  mayBeManualDiscountPercent,
  mayBeOverriddenUnitPrice,
  mayBeSaleLineQuantity,
  SALE_UNITS,
  SALE_VOID_REFUSALS,
  SEARCH_RESULT_LIMIT,
  WEIGHT_SOURCES,
} from "@purosur/domain";
import { z } from "zod";
import {
  authorizationRefusalSchema,
  authorizedBySchema,
  noThresholdRefusalSchema,
  partiallyPaidOutcomeSchema,
  plannedRefundSchema,
  reachesThresholdRefusalSchema,
  recordIdSchema,
  saleCancelRefusalSchema,
} from "../shared/index.js";

const cents = z.int().nonnegative();

const linePromotionSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("PERCENT_OFF"),
    percent: z.number().refine(isValidDiscountPercent),
  }),
  z
    .object({ kind: z.literal("BUY_N_PAY_M"), buy_qty: z.number(), pay_qty: z.number() })
    .refine(({ buy_qty, pay_qty }) => isValidDiscountBuyNPayM(buy_qty, pay_qty)),
]);

export const shownLineQuantitySchema = z.int().positive();

export const manualAdjustmentValueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PRICE"), value: z.int().refine(mayBeOverriddenUnitPrice) }),
  z.object({ kind: z.literal("PERCENT"), value: z.int().refine(mayBeManualDiscountPercent) }),
  z.object({ kind: z.literal("AMOUNT"), value: z.int().refine(mayBeManualDiscountAmount) }),
]);

export type ManualAdjustmentRequest = z.infer<typeof manualAdjustmentValueSchema>;

export const manualAdjustmentReasonSchema = z
  .string()
  .transform(manualAdjustmentReason)
  .pipe(z.string());

export const saleDiscountValueSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("PERCENT"), value: z.int().refine(mayBeManualDiscountPercent) }),
  z.object({ kind: z.literal("AMOUNT"), value: z.int().refine(mayBeManualDiscountAmount) }),
]);

export type SaleDiscountRequest = z.infer<typeof saleDiscountValueSchema>;

const appliedSaleDiscountSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("PERCENT"),
    value: z.int().refine(mayBeManualDiscountPercent),
    amount: cents,
  }),
  z.object({
    kind: z.literal("AMOUNT"),
    value: z.int().refine(mayBeManualDiscountAmount),
    amount: cents,
  }),
]);

const saleLineSchema = z.object({
  id: z.string(),
  product_id: z.string(),
  product_name: z.string(),
  sale_unit: z.enum(SALE_UNITS),
  weight_source: z.enum(WEIGHT_SOURCES).nullable(),
  quantity: shownLineQuantitySchema,
  list_unit_price: cents,
  discount_amount: cents,
  promotion: linePromotionSchema.nullable(),
  manual_adjustment: manualAdjustmentValueSchema.nullable(),
  line_total: cents,
});

export const saleSchema = z.object({
  id: z.string(),
  lines: z.array(saleLineSchema),
  subtotal: cents,
  sale_discount: appliedSaleDiscountSchema.nullable(),
  total: cents,
  paid: cents,
  pending: cents,
  lines_lock: z.enum(["approved_payment", "mercado_pago_charge_in_progress"]).nullable(),
  cancel_refusal: saleCancelRefusalSchema.nullable(),
  refunds_on_cancel: z.array(plannedRefundSchema),
  cancel_authorization_required: z.boolean(),
  adjust_authorization_required: z.boolean(),
  sale_discount_authorization_required: z.boolean(),
  sale_discount_refusal: z.enum(["empty_sale", "zero_total"]).nullable(),
  charge_refusal: z
    .discriminatedUnion("kind", [reachesThresholdRefusalSchema, noThresholdRefusalSchema])
    .nullable(),
  mercado_pago_charge_in_progress: z
    .object({
      payment_transaction_id: recordIdSchema(),
      method: z.enum(MERCADO_PAGO_PAYMENT_METHODS),
      amount: z.int().positive(),
      remaining_seconds: z.int().min(0),
      wait_seconds: z.int().positive(),
    })
    .nullable(),
});
export type OpenSale = z.infer<typeof saleSchema>;
export type CurrentSaleAnswer = OpenSale | null | "not_permitted";

export const cashChargeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("invalid_amount") }),
  z.object({ kind: z.literal("partial"), applied: z.number(), pending: z.number() }),
  z.object({ kind: z.literal("covered"), applied: z.number(), change: z.number() }),
]);
export type CashCharge = z.infer<typeof cashChargeSchema>;
export type CashChargeAnswer = CashCharge | null | "not_permitted";

const addedOutcome = z.object({
  kind: z.literal("added"),
  sale: saleSchema,
  removed_manual_discount: z.boolean(),
  removed_sale_discount: z.boolean(),
});
const noPriceOutcome = z.object({ kind: z.literal("no_price"), product_name: z.string() });
const weightNeededOutcome = z.object({
  kind: z.literal("weight_needed"),
  product_id: z.string(),
  product_name: z.string(),
});
const lineQuantityLimitOutcome = z.object({
  kind: z.literal("line_quantity_limit"),
  product_name: z.string(),
});
const notPermittedOutcome = z.object({ kind: z.literal("not_permitted") });
const notSignedInOutcome = z.object({ kind: z.literal("not_signed_in") });
const noOpenSessionOutcome = z.object({ kind: z.literal("no_open_session") });
const installationRevokedOutcome = z.object({ kind: z.literal("installation_revoked") });
const localDatabaseDamagedOutcome = z.object({ kind: z.literal("local_database_damaged") });
const batteryCriticalOutcome = z.object({ kind: z.literal("battery_critical") });
const diskSpaceShortOutcome = z.object({ kind: z.literal("disk_space_short") });
const paidOrderWithoutSaleOutcome = z.object({ kind: z.literal("paid_order_without_sale") });
const paidOrdersNotCheckedOutcome = z.object({ kind: z.literal("paid_orders_not_checked") });
const unavailableOutcome = z.object({ kind: z.literal("unavailable") });
const saleHasPaymentsOutcome = z.object({ kind: z.literal("sale_has_payments") });
export const qrChargeInProgressOutcome = z.object({
  kind: z.literal("mercado_pago_charge_in_progress"),
});

export const scanProductOutcomeSchema = z.discriminatedUnion("kind", [
  addedOutcome,
  z.object({ kind: z.literal("unknown_code") }),
  noPriceOutcome,
  weightNeededOutcome,
  lineQuantityLimitOutcome,
  saleHasPaymentsOutcome,
  notPermittedOutcome,
  notSignedInOutcome,
  noOpenSessionOutcome,
  installationRevokedOutcome,
  localDatabaseDamagedOutcome,
  batteryCriticalOutcome,
  diskSpaceShortOutcome,
  paidOrderWithoutSaleOutcome,
  paidOrdersNotCheckedOutcome,
  unavailableOutcome,
]);
export type ScanProductOutcome = z.infer<typeof scanProductOutcomeSchema>;

const saleRefusalSchemas = [
  z.object({ kind: z.literal("no_open_sale") }),
  notPermittedOutcome,
  notSignedInOutcome,
  noOpenSessionOutcome,
  unavailableOutcome,
] as const;

export const saleLineQuantitySchema = z
  .int()
  .refine((quantity) => mayBeSaleLineQuantity(quantity, "UNIT"));

export const saleLineWeightSchema = z.int().refine((weight) => mayBeSaleLineQuantity(weight, "KG"));

export const changeLineQuantityOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("changed"),
    sale: saleSchema,
    removed_manual_discount: z.boolean(),
    removed_sale_discount: z.boolean(),
  }),
  z.object({ kind: z.literal("unknown_line") }),
  z.object({ kind: z.literal("stale_quantity") }),
  z.object({ kind: z.literal("invalid_quantity") }),
  z.object({ kind: z.literal("sold_by_weight") }),
  saleHasPaymentsOutcome,
  ...saleRefusalSchemas,
]);
export type ChangeLineQuantityOutcome = z.infer<typeof changeLineQuantityOutcomeSchema>;

export const changeLineWeightOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("changed"),
    sale: saleSchema,
    removed_manual_discount: z.boolean(),
    removed_sale_discount: z.boolean(),
  }),
  z.object({ kind: z.literal("unknown_line") }),
  z.object({ kind: z.literal("stale_weight") }),
  z.object({ kind: z.literal("invalid_weight") }),
  z.object({ kind: z.literal("not_sold_by_weight") }),
  saleHasPaymentsOutcome,
  ...saleRefusalSchemas,
]);
export type ChangeLineWeightOutcome = z.infer<typeof changeLineWeightOutcomeSchema>;

export const adjustSaleLineOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("changed"), sale: saleSchema, removed_sale_discount: z.boolean() }),
  z.object({ kind: z.literal("unknown_line") }),
  z.object({ kind: z.literal("same_as_list_price") }),
  z.object({ kind: z.literal("discount_exceeds_line") }),
  z.object({ kind: z.literal("no_open_sale") }),
  z.object({ kind: z.literal("no_open_session") }),
  saleHasPaymentsOutcome,
  notPermittedOutcome,
  notSignedInOutcome,
  ...authorizationRefusalSchema.options,
]);
export type AdjustSaleLineOutcome = z.infer<typeof adjustSaleLineOutcomeSchema>;

export const previewSaleLineAdjustmentOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("preview"),
    discount_amount: z.int().nonnegative(),
    line_total: z.int().nonnegative(),
  }),
  z.object({ kind: z.literal("unknown_line") }),
  z.object({ kind: z.literal("same_as_list_price") }),
  z.object({ kind: z.literal("discount_exceeds_line") }),
  z.object({ kind: z.literal("no_open_sale") }),
  z.object({ kind: z.literal("no_open_session") }),
  saleHasPaymentsOutcome,
  notPermittedOutcome,
  notSignedInOutcome,
  z.object({ kind: z.literal("unavailable") }),
]);
export type PreviewSaleLineAdjustmentOutcome = z.infer<
  typeof previewSaleLineAdjustmentOutcomeSchema
>;

const saleDiscountRefusalSchemas = [
  z.object({ kind: z.literal("empty_sale") }),
  z.object({ kind: z.literal("zero_total") }),
  z.object({ kind: z.literal("discount_exceeds_sale") }),
  z.object({ kind: z.literal("no_open_sale") }),
  z.object({ kind: z.literal("no_open_session") }),
  saleHasPaymentsOutcome,
  notPermittedOutcome,
  notSignedInOutcome,
] as const;

export const applySaleDiscountOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("applied"), sale: saleSchema }),
  ...saleDiscountRefusalSchemas,
  ...authorizationRefusalSchema.options,
]);
export type ApplySaleDiscountOutcome = z.infer<typeof applySaleDiscountOutcomeSchema>;

export const previewSaleDiscountOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("preview"),
    subtotal: cents,
    discount_amount: cents,
    total: cents,
  }),
  ...saleDiscountRefusalSchemas,
  unavailableOutcome,
]);
export type PreviewSaleDiscountOutcome = z.infer<typeof previewSaleDiscountOutcomeSchema>;

export const removeSaleLineOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("removed"), sale: saleSchema, removed_sale_discount: z.boolean() }),
  z.object({ kind: z.literal("unknown_line") }),
  saleHasPaymentsOutcome,
  ...saleRefusalSchemas,
]);
export type RemoveSaleLineOutcome = z.infer<typeof removeSaleLineOutcomeSchema>;

export const cancelSaleOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cancelled") }),
  z.object({ kind: z.literal("has_approved_payment") }),
  qrChargeInProgressOutcome,
  ...saleRefusalSchemas,
]);
export type CancelSaleOutcome = z.infer<typeof cancelSaleOutcomeSchema>;

export const cancelPaidSaleOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("cancelled"),
    refunds: z.array(plannedRefundSchema),
    authorized_by: authorizedBySchema.nullable(),
  }),
  z.object({ kind: z.literal("no_open_sale") }),
  z.object({ kind: z.literal("no_open_session") }),
  qrChargeInProgressOutcome,
  notPermittedOutcome,
  notSignedInOutcome,
  ...authorizationRefusalSchema.options,
]);
export type CancelPaidSaleOutcome = z.infer<typeof cancelPaidSaleOutcomeSchema>;

export const voidSaleOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("voided"),
    refunds: z.array(plannedRefundSchema),
    authorized_by: authorizedBySchema.nullable(),
  }),
  z.object({ kind: z.literal("not_found") }),
  z.object({ kind: z.enum(SALE_VOID_REFUSALS) }),
  z.object({ kind: z.literal("pending_refunds_unconfirmed") }),
  notSignedInOutcome,
  ...authorizationRefusalSchema.options,
]);
export type VoidSaleOutcome = z.infer<typeof voidSaleOutcomeSchema>;

export const addProductOutcomeSchema = z.discriminatedUnion("kind", [
  addedOutcome,
  z.object({ kind: z.literal("product_unavailable") }),
  noPriceOutcome,
  weightNeededOutcome,
  lineQuantityLimitOutcome,
  saleHasPaymentsOutcome,
  notPermittedOutcome,
  notSignedInOutcome,
  noOpenSessionOutcome,
  installationRevokedOutcome,
  localDatabaseDamagedOutcome,
  batteryCriticalOutcome,
  diskSpaceShortOutcome,
  paidOrderWithoutSaleOutcome,
  paidOrdersNotCheckedOutcome,
  unavailableOutcome,
]);
export type AddProductOutcome = z.infer<typeof addProductOutcomeSchema>;

export const addWeighedProductOutcomeSchema = z.discriminatedUnion("kind", [
  addedOutcome,
  z.object({ kind: z.literal("product_unavailable") }),
  z.object({ kind: z.literal("not_sold_by_weight") }),
  z.object({ kind: z.literal("invalid_weight") }),
  noPriceOutcome,
  saleHasPaymentsOutcome,
  notPermittedOutcome,
  notSignedInOutcome,
  noOpenSessionOutcome,
  installationRevokedOutcome,
  localDatabaseDamagedOutcome,
  batteryCriticalOutcome,
  diskSpaceShortOutcome,
  paidOrderWithoutSaleOutcome,
  paidOrdersNotCheckedOutcome,
  unavailableOutcome,
]);
export type AddWeighedProductOutcome = z.infer<typeof addWeighedProductOutcomeSchema>;

export const weighProductOutcomeSchema = z.discriminatedUnion("kind", [
  addedOutcome,
  z.object({ kind: z.literal("weighing") }),
  z.object({ kind: z.literal("scale_unavailable") }),
  z.object({ kind: z.literal("product_unavailable") }),
  z.object({ kind: z.literal("not_sold_by_weight") }),
  noPriceOutcome,
  saleHasPaymentsOutcome,
  notPermittedOutcome,
  notSignedInOutcome,
  noOpenSessionOutcome,
  installationRevokedOutcome,
  localDatabaseDamagedOutcome,
  batteryCriticalOutcome,
  diskSpaceShortOutcome,
  paidOrderWithoutSaleOutcome,
  paidOrdersNotCheckedOutcome,
  unavailableOutcome,
]);
export type WeighProductOutcome = z.infer<typeof weighProductOutcomeSchema>;

const foundProductSchema = z.object({
  product_id: z.string(),
  name: z.string(),
  sale_unit: z.enum(SALE_UNITS),
  unit_price: cents.nullable(),
  matches: z.array(z.object({ start: z.int().nonnegative(), length: z.int().positive() })),
});
export type FoundProduct = z.infer<typeof foundProductSchema>;

export const searchProductsOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("results"),
    products: z.array(foundProductSchema).max(SEARCH_RESULT_LIMIT),
    more: z.boolean(),
  }),
  notPermittedOutcome,
  notSignedInOutcome,
  noOpenSessionOutcome,
  unavailableOutcome,
]);
export type SearchProductsOutcome = z.infer<typeof searchProductsOutcomeSchema>;

export const chargeSaleInCashOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("completed"),
    sale_id: z.string(),
    total: cents,
    tendered: cents,
    change: cents,
  }),
  partiallyPaidOutcomeSchema,
  z.object({ kind: z.literal("invalid_amount") }),
  z.object({ kind: z.literal("empty_sale") }),
  z.object({ kind: z.literal("zero_total") }),
  reachesThresholdRefusalSchema,
  noThresholdRefusalSchema,
  z.object({ kind: z.literal("no_open_sale") }),
  z.object({ kind: z.literal("not_permitted") }),
  z.object({ kind: z.literal("not_signed_in") }),
  z.object({ kind: z.literal("no_open_session") }),
  z.object({ kind: z.literal("unavailable") }),
  qrChargeInProgressOutcome,
]);
export type ChargeSaleInCashOutcome = z.infer<typeof chargeSaleInCashOutcomeSchema>;

const chargeSaleConfirmedByHandOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("completed"), sale_id: z.string(), total: cents }),
  partiallyPaidOutcomeSchema,
  z.object({ kind: z.literal("invalid_amount") }),
  z.object({ kind: z.literal("exceeds_pending"), pending: cents }),
  z.object({ kind: z.literal("empty_sale") }),
  z.object({ kind: z.literal("zero_total") }),
  reachesThresholdRefusalSchema,
  noThresholdRefusalSchema,
  z.object({ kind: z.literal("no_open_sale") }),
  z.object({ kind: z.literal("not_permitted") }),
  z.object({ kind: z.literal("not_signed_in") }),
  z.object({ kind: z.literal("no_open_session") }),
  z.object({ kind: z.literal("unavailable") }),
  qrChargeInProgressOutcome,
]);
export const chargeSaleByTransferOutcomeSchema = chargeSaleConfirmedByHandOutcomeSchema;
export type ChargeSaleByTransferOutcome = z.infer<typeof chargeSaleByTransferOutcomeSchema>;

export const chargeSaleOnStandaloneTerminalOutcomeSchema = chargeSaleConfirmedByHandOutcomeSchema;
export type ChargeSaleOnStandaloneTerminalOutcome = z.infer<
  typeof chargeSaleOnStandaloneTerminalOutcomeSchema
>;
