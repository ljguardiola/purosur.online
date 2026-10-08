import {
  CASH_MOVEMENT_KINDS,
  CASH_MOVEMENT_TYPES,
  cashMovementReason,
  isValidCashAmount,
  isValidCashMovementAmount,
  PRE_EMISSION_GATE_FAILURE_REASONS,
} from "@purosur/domain";
import { z } from "zod";

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

const saleCashMovementSchema = z.object({
  id: text,
  type: z.enum(CASH_MOVEMENT_TYPES),
  amount: cents,
  ref_type: text,
  ref_id: text,
  actor_id: text,
  occurred_at: instant,
});

const approvedPayment = {
  id: text,
  kind: z.literal("SALE"),
  provider: z.literal("NONE"),
  amount: cents,
  state: z.literal("APPROVED"),
  occurred_at: instant,
};

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

const paymentSchema = z.discriminatedUnion("method", [cashPaymentSchema, transferPaymentSchema]);

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

const PAYLOAD_SCHEMAS = {
  "sale_completed@1": saleCompletedV1Schema,
  "sale_completed@2": saleCompletedV2Schema,
  "cash_session_opened@1": cashSessionOpenedSchema,
  "cash_session_closed@1": cashSessionClosedSchema,
  "cash_movement_recorded@1": cashMovementRecordedSchema,
  "fiscal_gate_failed@1": fiscalGateFailedSchema,
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
