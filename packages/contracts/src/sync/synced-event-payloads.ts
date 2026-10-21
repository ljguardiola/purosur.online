import {
  CASH_MOVEMENT_KINDS,
  CASH_MOVEMENT_TYPES,
  cashMovementReason,
  FACTURA_C_DOCUMENT_TYPE,
  isCalendarDay,
  isValidCashAmount,
  isValidCashMovementAmount,
  manualAdjustmentReason,
  mayBeManualDiscountAmount,
  mayBeManualDiscountPercent,
  mayBeMovementQuantity,
  mayBeOverriddenUnitPrice,
  OFFLINE_AUTHORIZATION_CAUSES,
  PRE_EMISSION_GATE_FAILURE_REASONS,
  receiptReprintReason,
  WEIGHT_SOURCES,
} from "@purosur/domain";
import { z } from "zod";
import { pointOfSaleNumberSchema, recordIdSchema, voidCreditNoteSchema } from "../shared/index.js";

const text = z.string().min(1);
const instant = z.iso.datetime();
const cents = z.int().nonnegative();
const cashAmount = z.int().refine(isValidCashAmount);

const linePromotionSchema = z.discriminatedUnion("kind", [
  z.object({
    discount_id: text,
    kind: z.literal("PERCENT_OFF"),
    percent: z.int(),
    buy_qty: z.null(),
    pay_qty: z.null(),
  }),
  z.object({
    discount_id: text,
    kind: z.literal("BUY_N_PAY_M"),
    percent: z.null(),
    buy_qty: z.int(),
    pay_qty: z.int(),
  }),
]);

const saleLineSchema = z.object({
  id: text,
  product_id: text,
  product_name: z.string(),
  quantity: z.int().positive(),
  list_unit_price: cents,
  price_list_id: text,
  promotion_id: text.nullable(),
  discount_amount: cents,
  promotions: z.array(linePromotionSchema),
  line_total: cents,
});

const weighedSaleLineSchema = saleLineSchema.extend({
  weight_source: z.enum(WEIGHT_SOURCES).nullable(),
});

const manualAdjustmentFields = {
  reason: z.string().refine((reason) => manualAdjustmentReason(reason) === reason),
  authorized_by: text.nullable(),
};

const saleDiscountFields = {
  amount: cents,
  reason: z.string().refine((reason) => manualAdjustmentReason(reason) === reason),
  authorized_by: text.nullable(),
};

const manualAdjustmentSchema = z.discriminatedUnion("kind", [
  z.object({
    ...manualAdjustmentFields,
    kind: z.literal("PRICE"),
    value: z.int().refine(mayBeOverriddenUnitPrice),
  }),
  z.object({
    ...manualAdjustmentFields,
    kind: z.literal("PERCENT"),
    value: z.int().refine(mayBeManualDiscountPercent),
  }),
  z.object({
    ...manualAdjustmentFields,
    kind: z.literal("AMOUNT"),
    value: z.int().refine(mayBeManualDiscountAmount),
  }),
]);

const adjustedSaleLineSchema = weighedSaleLineSchema.extend({
  manual_adjustment: manualAdjustmentSchema.nullable(),
});

const saleDiscountSchema = z.discriminatedUnion("kind", [
  z.object({
    ...saleDiscountFields,
    kind: z.literal("PERCENT"),
    value: z.int().refine(mayBeManualDiscountPercent),
  }),
  z.object({
    ...saleDiscountFields,
    kind: z.literal("AMOUNT"),
    value: z.int().refine(mayBeManualDiscountAmount),
  }),
]);

const discountedSaleLineSchema = adjustedSaleLineSchema.extend({
  sale_discount_share: cents,
});

const saleCashMovementSchema = z.object({
  id: text,
  type: z.enum(CASH_MOVEMENT_TYPES),
  amount: cents,
  ref_type: text,
  ref_id: text,
  actor_id: text,
  occurred_at: instant,
});

const saleStockMovementSchema = z.object({
  id: text,
  sale_line_id: text,
  product_id: text,
  delta: z.int().refine((delta) => mayBeMovementQuantity(-delta)),
});

const approvedPaymentFields = {
  id: text,
  kind: z.literal("SALE"),
  amount: cents,
  state: z.literal("APPROVED"),
  occurred_at: instant,
};

const approvedPayment = { ...approvedPaymentFields, provider: z.literal("NONE") };

const cashPaymentV1Schema = z.object({
  ...approvedPayment,
  method: z.literal("CASH"),
  tendered: cents.nullable(),
  authorized_by: z.null().optional(),
  confirmed_at: z.null().optional(),
});

const cashPaymentSchema = z.object({
  ...approvedPayment,
  method: z.literal("CASH"),
  tendered: cents.nullable(),
  authorized_by: z.null(),
  confirmed_at: z.null(),
});

const transferPaymentSchema = z.object({
  ...approvedPayment,
  method: z.literal("TRANSFER"),
  tendered: z.null(),
  authorized_by: text,
  confirmed_at: instant,
});

const standaloneTerminalPaymentSchema = z.object({
  ...approvedPaymentFields,
  method: z.literal("STANDALONE_TERMINAL"),
  provider: z.literal("EXTERNAL_TERMINAL"),
  tendered: z.null(),
  authorized_by: text,
  confirmed_at: instant,
});

const mercadoPagoQrPaymentSchema = z.object({
  ...approvedPaymentFields,
  method: z.literal("QR"),
  provider: z.literal("MERCADOPAGO_QR"),
  tendered: z.null(),
  authorized_by: z.null(),
  confirmed_at: z.null(),
});

const mercadoPagoPointPaymentSchema = z.object({
  ...approvedPaymentFields,
  method: z.literal("POINT"),
  provider: z.literal("MERCADOPAGO_POINT"),
  tendered: z.null(),
  authorized_by: z.null(),
  confirmed_at: z.null(),
});

const paymentSchema = z.discriminatedUnion("method", [cashPaymentSchema, transferPaymentSchema]);

const paymentWithQrSchema = z.discriminatedUnion("method", [
  cashPaymentSchema,
  transferPaymentSchema,
  mercadoPagoQrPaymentSchema,
]);

const saleCompletedFields = {
  id: text,
  register_id: text,
  device_id: text,
  session_id: text,
  actor_id: text,
  occurred_at: instant,
  total: cents,
  lines: z.array(saleLineSchema),
  cash_movements: z.array(saleCashMovementSchema),
};

const saleCompletedV1Schema = z.object({
  ...saleCompletedFields,
  completed_at: instant,
  payments: z.array(z.union([cashPaymentV1Schema, paymentSchema])).min(1),
});

const saleCompletedV2Schema = z.object({
  ...saleCompletedFields,
  payments: z.array(paymentSchema).min(1),
});

const saleCompletedV3Schema = saleCompletedV2Schema.extend({
  stock_movements: z.array(saleStockMovementSchema),
});

const saleCompletedV4Schema = saleCompletedV3Schema.extend({
  operation_number: z.int().positive(),
});

const saleCompletedV5Schema = saleCompletedV4Schema.extend({
  payments: z.array(paymentWithQrSchema).min(1),
});

const saleCompletedV6Schema = saleCompletedV5Schema.extend({
  lines: z.array(weighedSaleLineSchema),
});

const saleCompletedV7Schema = saleCompletedV6Schema.extend({
  lines: z.array(adjustedSaleLineSchema),
});

const paymentWithMercadoPagoSchema = z.discriminatedUnion("method", [
  cashPaymentSchema,
  transferPaymentSchema,
  mercadoPagoQrPaymentSchema,
  mercadoPagoPointPaymentSchema,
  standaloneTerminalPaymentSchema,
]);

const saleCompletedV8Schema = saleCompletedV7Schema.extend({
  payments: z.array(paymentWithMercadoPagoSchema).min(1),
  sale_discount: saleDiscountSchema.nullable(),
  lines: z.array(discountedSaleLineSchema),
});

const salePrintStateChangedSchema = z.object({
  sale_id: text,
  print_attempted_at: instant,
  printed_at: instant.nullable(),
});

const reprintRecordedFields = {
  sale_id: text,
  order_number: z.int().positive(),
  requested_by: text,
  authorized_by: text.nullable(),
};

const reprintRecordedSchema = z.discriminatedUnion("reason_kind", [
  z.object({
    ...reprintRecordedFields,
    reason_kind: z.literal("retry"),
    reason_text: z.null(),
  }),
  z.object({
    ...reprintRecordedFields,
    reason_kind: z.literal("requested"),
    reason_text: z.string().refine((reason) => receiptReprintReason(reason) === reason),
  }),
]);

const saleRefundFields = {
  id: text,
  kind: z.literal("REFUND"),
  parent_id: text,
  amount: cents,
  occurred_at: instant,
};

const saleRefundSchema = z.discriminatedUnion("method", [
  z.object({
    ...saleRefundFields,
    method: z.literal("CASH"),
    provider: z.literal("NONE"),
    state: z.literal("APPROVED"),
  }),
  z.object({
    ...saleRefundFields,
    method: z.literal("TRANSFER"),
    provider: z.literal("NONE"),
    state: z.literal("PENDING"),
  }),
]);

const standaloneTerminalRefundSchema = z.object({
  ...saleRefundFields,
  method: z.literal("STANDALONE_TERMINAL"),
  provider: z.literal("EXTERNAL_TERMINAL"),
  state: z.literal("PENDING"),
});

const saleRefundWithStandaloneTerminalSchema = z.discriminatedUnion("method", [
  ...saleRefundSchema.options,
  standaloneTerminalRefundSchema,
]);

const saleCancelledV1Schema = z.object({
  ...saleCompletedFields,
  authorized_by: text.nullable(),
  payments: z.array(paymentSchema).min(1),
  refunds: z.array(saleRefundSchema).min(1),
});

const saleCancelledV2Schema = saleCancelledV1Schema.extend({
  lines: z.array(weighedSaleLineSchema),
});

const saleCancelledV3Schema = saleCancelledV2Schema.extend({
  lines: z.array(adjustedSaleLineSchema),
});

const saleCancelledV4Schema = saleCancelledV3Schema.extend({
  sale_discount: saleDiscountSchema.nullable(),
  lines: z.array(discountedSaleLineSchema),
});

const paymentWithStandaloneTerminalSchema = z.discriminatedUnion("method", [
  cashPaymentSchema,
  transferPaymentSchema,
  standaloneTerminalPaymentSchema,
]);

const saleCancelledV5Schema = saleCancelledV4Schema.extend({
  payments: z.array(paymentWithStandaloneTerminalSchema).min(1),
  refunds: z.array(saleRefundWithStandaloneTerminalSchema).min(1),
});

const qrRefundSchema = z.object({
  ...saleRefundFields,
  method: z.literal("QR"),
  provider: z.literal("MERCADOPAGO_QR"),
  state: z.literal("PENDING"),
});

const saleRefundWithQrSchema = z.discriminatedUnion("method", [
  ...saleRefundWithStandaloneTerminalSchema.options,
  qrRefundSchema,
]);

const pointRefundSchema = z.object({
  ...saleRefundFields,
  method: z.literal("POINT"),
  provider: z.literal("MERCADOPAGO_POINT"),
  state: z.literal("PENDING"),
});

const saleRefundWithMercadoPagoSchema = z.discriminatedUnion("method", [
  ...saleRefundWithQrSchema.options,
  pointRefundSchema,
]);

const paymentWithQrAndStandaloneTerminalSchema = z.discriminatedUnion("method", [
  cashPaymentSchema,
  transferPaymentSchema,
  standaloneTerminalPaymentSchema,
  mercadoPagoQrPaymentSchema,
]);

const saleCancelledV6Schema = saleCancelledV5Schema.extend({
  payments: z.array(paymentWithQrAndStandaloneTerminalSchema).min(1),
  refunds: z.array(saleRefundWithQrSchema).min(1),
});

const saleCancelledV7Schema = saleCancelledV6Schema.extend({
  payments: z.array(paymentWithMercadoPagoSchema).min(1),
  refunds: z.array(saleRefundWithMercadoPagoSchema).min(1),
});

const returnedStockMovementSchema = z.object({
  id: text,
  sale_line_id: text,
  product_id: text,
  delta: z.int().refine(mayBeMovementQuantity),
});

const saleVoidedV1Schema = z.object({
  ...saleCompletedFields,
  lines: z.array(discountedSaleLineSchema),
  authorized_by: text.nullable(),
  sale_discount: saleDiscountSchema.nullable(),
  payments: z.array(paymentWithStandaloneTerminalSchema).min(1),
  refunds: z.array(saleRefundWithStandaloneTerminalSchema).min(1),
  stock_movements: z.array(returnedStockMovementSchema),
  deferred_record_cancelled: z.boolean(),
});

const saleVoidedV2Schema = saleVoidedV1Schema.extend({
  payments: z.array(paymentWithMercadoPagoSchema).min(1),
  refunds: z.array(saleRefundWithMercadoPagoSchema).min(1),
});

const saleVoidedV3Schema = saleVoidedV2Schema.extend({
  credit_note: voidCreditNoteSchema.nullable(),
});

const cashSessionOpenedSchema = z.object({
  opened_by: text,
  opened_at: instant,
  opening_float: cashAmount,
});

const cashSessionClosedSchema = z.object({
  closed_by: text,
  closed_at: instant,
  expected_cash: cashAmount,
  counted_cash: cashAmount,
  difference: z.int(),
});

const cashMovementRecordedSchema = z.object({
  type: z.enum(CASH_MOVEMENT_KINDS),
  amount: z.int().refine(isValidCashMovementAmount),
  reason: z.string().refine((reason) => cashMovementReason(reason) === reason),
  ref_type: text.nullable(),
  ref_id: text.nullable(),
  actor_id: text,
  authorized_by: text.nullable(),
  occurred_at: instant,
});

const fiscalGateFailedSchema = z.object({
  sale_id: text,
  register_id: text,
  reason: z.enum(PRE_EMISSION_GATE_FAILURE_REASONS),
  evaluated_at: instant,
});

const offlineFiscalDocumentIssuedSchema = z.object({
  fiscal_document_id: text,
  sale_id: text,
  register_id: text,
  point_of_sale: pointOfSaleNumberSchema,
  document_type: z.literal(FACTURA_C_DOCUMENT_TYPE),
  number: z.int().positive(),
  issued_on: z.string().refine(isCalendarDay),
  generated_at: instant,
  generation_stamp: z.string().regex(/^\d{14}$/),
  offline_authorization_code: text,
  fortnight_start: z.string().refine(isCalendarDay),
  fortnight_end: z.string().refine(isCalendarDay),
  buyer_document_type: z.int().nonnegative(),
  buyer_document_number: z.int().nonnegative(),
  buyer_tax_status_code: z.int(),
  total: cents,
  net_amount: cents,
  cause: z.enum(OFFLINE_AUTHORIZATION_CAUSES),
});

const invoiceSchema = z.object({
  invoice_class: z.literal("C"),
  total: cents,
  net_amount: cents,
  vat_amount: z.literal(0),
  issuer: z.object({
    legal_name: text,
    cuit: text,
    tax_status: text,
    gross_income_registration: text,
    activity_start_date: z.string().refine(isCalendarDay),
    version: z.int(),
  }),
  buyer_tax_status_code: z.int(),
  buyer_tax_status_description: z.string(),
});

const offlineFiscalDocumentIssuedV2Schema = offlineFiscalDocumentIssuedSchema.extend({
  document: invoiceSchema,
});

const clockCorrectedSchema = z.object({
  point_of_sale: pointOfSaleNumberSchema,
  document_type: z.literal(FACTURA_C_DOCUMENT_TYPE),
  previous_reading: instant,
  corrected_reading: instant,
});

const qrPaymentReplacedSchema = z.object({
  payment_transaction_id: text,
  sale_id: text,
});

const openingCountRecordedSchema = z.object({
  movement_id: recordIdSchema(),
  product_id: recordIdSchema(),
  counted: z.int().refine(mayBeMovementQuantity),
  expires_on: z.string().refine(isCalendarDay).nullable(),
});

const openingCountWithdrawnSchema = z.object({
  movement_id: recordIdSchema(),
  withdrawn_movement_id: recordIdSchema(),
});

const PAYLOAD_SCHEMAS = {
  "sale_completed@1": saleCompletedV1Schema,
  "sale_completed@2": saleCompletedV2Schema,
  "sale_completed@3": saleCompletedV3Schema,
  "sale_completed@4": saleCompletedV4Schema,
  "sale_completed@5": saleCompletedV5Schema,
  "sale_completed@6": saleCompletedV6Schema,
  "sale_completed@7": saleCompletedV7Schema,
  "sale_completed@8": saleCompletedV8Schema,
  "sale_print_state_changed@1": salePrintStateChangedSchema,
  "reprint_recorded@1": reprintRecordedSchema,
  "sale_cancelled@1": saleCancelledV1Schema,
  "sale_cancelled@2": saleCancelledV2Schema,
  "sale_cancelled@3": saleCancelledV3Schema,
  "sale_cancelled@4": saleCancelledV4Schema,
  "sale_cancelled@5": saleCancelledV5Schema,
  "sale_cancelled@6": saleCancelledV6Schema,
  "sale_cancelled@7": saleCancelledV7Schema,
  "sale_voided@1": saleVoidedV1Schema,
  "sale_voided@2": saleVoidedV2Schema,
  "sale_voided@3": saleVoidedV3Schema,
  "cash_session_opened@1": cashSessionOpenedSchema,
  "cash_session_closed@1": cashSessionClosedSchema,
  "cash_movement_recorded@1": cashMovementRecordedSchema,
  "fiscal_gate_failed@1": fiscalGateFailedSchema,
  "offline_fiscal_document_issued@1": offlineFiscalDocumentIssuedSchema,
  "offline_fiscal_document_issued@2": offlineFiscalDocumentIssuedV2Schema,
  "clock_corrected@1": clockCorrectedSchema,
  "qr_payment_replaced@1": qrPaymentReplacedSchema,
  "opening_count_recorded@1": openingCountRecordedSchema,
  "opening_count_withdrawn@1": openingCountWithdrawnSchema,
};

export type SyncedEventPayloads = {
  [Key in keyof typeof PAYLOAD_SCHEMAS]: z.output<(typeof PAYLOAD_SCHEMAS)[Key]>;
};

export type SyncedEventPayloadKey = keyof SyncedEventPayloads;

const SCHEMAS: { [Key in SyncedEventPayloadKey]: z.ZodType<SyncedEventPayloads[Key]> } =
  PAYLOAD_SCHEMAS;

function isSyncedEventPayloadKey(key: string): key is SyncedEventPayloadKey {
  return Object.hasOwn(SCHEMAS, key);
}

export function syncedEventPayloadKey(
  eventType: string,
  schemaVersion: number,
): SyncedEventPayloadKey | undefined {
  const key = [eventType, schemaVersion].join("@");
  return isSyncedEventPayloadKey(key) ? key : undefined;
}

export function syncedEventPayloadSchema<Key extends SyncedEventPayloadKey>(
  key: Key,
): z.ZodType<SyncedEventPayloads[Key]> {
  return SCHEMAS[key];
}

export const READABLE_EVENT_VERSIONS: readonly string[] = Object.keys(PAYLOAD_SCHEMAS);
