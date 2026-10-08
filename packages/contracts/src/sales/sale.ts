import {
  isValidDiscountBuyNPayM,
  isValidDiscountPercent,
  SALE_UNITS,
  SEARCH_RESULT_LIMIT,
} from "@purosur/domain";
import { z } from "zod";
import {
  authorizationRefusalSchema,
  authorizedBySchema,
  plannedRefundSchema,
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

const saleLineSchema = z.object({
  id: z.string(),
  product_id: z.string(),
  product_name: z.string(),
  quantity: z.int().positive(),
  list_unit_price: cents,
  discount_amount: cents,
  promotion: linePromotionSchema.nullable(),
  line_total: cents,
});

const reachesThresholdRefusal = z.object({
  kind: z.literal("reaches_buyer_identification_threshold"),
  threshold: z.int().positive(),
});
const noThresholdRefusal = z.object({ kind: z.literal("no_buyer_identification_threshold") });

export const saleSchema = z.object({
  id: z.string(),
  lines: z.array(saleLineSchema),
  total: cents,
  paid: cents,
  pending: cents,
  lines_editable: z.boolean(),
  cancellable: z.boolean(),
  refunds_on_cancel: z.array(plannedRefundSchema),
  cancel_authorization_required: z.boolean(),
  charge_refusal: z
    .discriminatedUnion("kind", [reachesThresholdRefusal, noThresholdRefusal])
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

const addedOutcome = z.object({ kind: z.literal("added"), sale: saleSchema });
const noPriceOutcome = z.object({ kind: z.literal("no_price"), product_name: z.string() });
const soldByWeightOutcome = z.object({
  kind: z.literal("sold_by_weight"),
  product_name: z.string(),
});
const notPermittedOutcome = z.object({ kind: z.literal("not_permitted") });
const notSignedInOutcome = z.object({ kind: z.literal("not_signed_in") });
const noOpenSessionOutcome = z.object({ kind: z.literal("no_open_session") });
const installationRevokedOutcome = z.object({ kind: z.literal("installation_revoked") });
const unavailableOutcome = z.object({ kind: z.literal("unavailable") });
const saleHasPaymentsOutcome = z.object({ kind: z.literal("sale_has_payments") });
const partiallyPaidOutcome = z.object({
  kind: z.literal("partially_paid"),
  sale_id: z.string(),
  total: cents,
  paid: cents,
  pending: cents,
});

export const scanProductOutcomeSchema = z.discriminatedUnion("kind", [
  addedOutcome,
  z.object({ kind: z.literal("unknown_code") }),
  noPriceOutcome,
  soldByWeightOutcome,
  saleHasPaymentsOutcome,
  notPermittedOutcome,
  notSignedInOutcome,
  noOpenSessionOutcome,
  installationRevokedOutcome,
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

export const saleLineQuantitySchema = z.int().positive();

export const changeLineQuantityOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("changed"), sale: saleSchema }),
  z.object({ kind: z.literal("unknown_line") }),
  z.object({ kind: z.literal("stale_quantity") }),
  z.object({ kind: z.literal("invalid_quantity") }),
  saleHasPaymentsOutcome,
  ...saleRefusalSchemas,
]);
export type ChangeLineQuantityOutcome = z.infer<typeof changeLineQuantityOutcomeSchema>;

export const removeSaleLineOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("removed"), sale: saleSchema }),
  z.object({ kind: z.literal("unknown_line") }),
  saleHasPaymentsOutcome,
  ...saleRefusalSchemas,
]);
export type RemoveSaleLineOutcome = z.infer<typeof removeSaleLineOutcomeSchema>;

export const cancelSaleOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cancelled") }),
  z.object({ kind: z.literal("has_approved_payment") }),
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
  notPermittedOutcome,
  notSignedInOutcome,
  ...authorizationRefusalSchema.options,
]);
export type CancelPaidSaleOutcome = z.infer<typeof cancelPaidSaleOutcomeSchema>;

export const addProductOutcomeSchema = z.discriminatedUnion("kind", [
  addedOutcome,
  z.object({ kind: z.literal("product_unavailable") }),
  noPriceOutcome,
  soldByWeightOutcome,
  saleHasPaymentsOutcome,
  notPermittedOutcome,
  notSignedInOutcome,
  noOpenSessionOutcome,
  installationRevokedOutcome,
  unavailableOutcome,
]);
export type AddProductOutcome = z.infer<typeof addProductOutcomeSchema>;

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
  partiallyPaidOutcome,
  z.object({ kind: z.literal("invalid_amount") }),
  z.object({ kind: z.literal("empty_sale") }),
  z.object({ kind: z.literal("zero_total") }),
  reachesThresholdRefusal,
  noThresholdRefusal,
  z.object({ kind: z.literal("no_open_sale") }),
  z.object({ kind: z.literal("not_permitted") }),
  z.object({ kind: z.literal("not_signed_in") }),
  z.object({ kind: z.literal("no_open_session") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type ChargeSaleInCashOutcome = z.infer<typeof chargeSaleInCashOutcomeSchema>;

export const chargeSaleByTransferOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("completed"), sale_id: z.string(), total: cents }),
  partiallyPaidOutcome,
  z.object({ kind: z.literal("invalid_amount") }),
  z.object({ kind: z.literal("exceeds_pending"), pending: cents }),
  z.object({ kind: z.literal("empty_sale") }),
  z.object({ kind: z.literal("zero_total") }),
  reachesThresholdRefusal,
  noThresholdRefusal,
  z.object({ kind: z.literal("no_open_sale") }),
  z.object({ kind: z.literal("not_permitted") }),
  z.object({ kind: z.literal("not_signed_in") }),
  z.object({ kind: z.literal("no_open_session") }),
  z.object({ kind: z.literal("unavailable") }),
]);
export type ChargeSaleByTransferOutcome = z.infer<typeof chargeSaleByTransferOutcomeSchema>;
