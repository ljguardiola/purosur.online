import {
  isCalendarDay,
  mayBeMovementQuantity,
  SALE_UNITS,
  SEARCH_RESULT_LIMIT,
} from "@purosur/domain";
import { z } from "zod";
import { requestIdSchema } from "../shared/index.js";

const requestId = requestIdSchema;

const countedQuantitySchema = z.int().refine(mayBeMovementQuantity);
const expiryDaySchema = z.string().refine(isCalendarDay);

const readInitialCountMessageSchema = z.object({
  type: z.literal("read-initial-count"),
  request_id: requestId,
});

const recordInitialCountLineMessageSchema = z.object({
  type: z.literal("record-initial-count-line"),
  request_id: requestId,
  product_id: z.string(),
  counted: countedQuantitySchema,
  expires_on: expiryDaySchema.nullable(),
});

const withdrawInitialCountLineMessageSchema = z.object({
  type: z.literal("withdraw-initial-count-line"),
  request_id: requestId,
  movement_id: z.string(),
});

const findCountableProductMessageSchema = z.object({
  type: z.literal("find-countable-product"),
  request_id: requestId,
  code: z.string().min(1),
});

const searchCountableProductsMessageSchema = z.object({
  type: z.literal("search-countable-products"),
  request_id: requestId,
  query: z.string(),
});

const weighCountedProductMessageSchema = z.object({
  type: z.literal("weigh-counted-product"),
  request_id: requestId,
  product_id: z.string(),
});

export const stockRendererToCoreMessageSchema = z.discriminatedUnion("type", [
  readInitialCountMessageSchema,
  recordInitialCountLineMessageSchema,
  withdrawInitialCountLineMessageSchema,
  findCountableProductMessageSchema,
  searchCountableProductsMessageSchema,
  weighCountedProductMessageSchema,
]);
export type StockRendererToCoreMessage = z.infer<typeof stockRendererToCoreMessageSchema>;

const notPermittedOutcome = z.object({ kind: z.literal("not_permitted") });
const notSignedInOutcome = z.object({ kind: z.literal("not_signed_in") });
const notOfferedOutcome = z.object({ kind: z.literal("not_offered") });
const unavailableOutcome = z.object({ kind: z.literal("unavailable") });

const initialCountLineSchema = z.object({
  movement_id: z.string(),
  product_id: z.string(),
  product_name: z.string(),
  sale_unit: z.enum(SALE_UNITS),
  counted: countedQuantitySchema,
  expires_on: expiryDaySchema.nullable(),
});
export type InitialCountLine = z.infer<typeof initialCountLineSchema>;

export const readInitialCountOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("read"),
    offered: z.boolean(),
    lines: z.array(initialCountLineSchema),
  }),
  notPermittedOutcome,
  notSignedInOutcome,
]);
export type ReadInitialCountOutcome = z.infer<typeof readInitialCountOutcomeSchema>;

export const recordInitialCountLineOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("recorded"), line: initialCountLineSchema }),
  z.object({ kind: z.literal("unknown_product") }),
  z.object({ kind: z.literal("invalid_quantity") }),
  z.object({ kind: z.literal("invalid_expiry") }),
  notPermittedOutcome,
  notSignedInOutcome,
  notOfferedOutcome,
  unavailableOutcome,
]);
export type RecordInitialCountLineOutcome = z.infer<typeof recordInitialCountLineOutcomeSchema>;

export const withdrawInitialCountLineOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("withdrawn") }),
  z.object({ kind: z.literal("not_found") }),
  z.object({ kind: z.literal("already_withdrawn") }),
  notPermittedOutcome,
  notSignedInOutcome,
  notOfferedOutcome,
  unavailableOutcome,
]);
export type WithdrawInitialCountLineOutcome = z.infer<typeof withdrawInitialCountLineOutcomeSchema>;

export const findCountableProductOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("found"),
    product: z.object({
      product_id: z.string(),
      name: z.string(),
      sale_unit: z.enum(SALE_UNITS),
    }),
  }),
  z.object({ kind: z.literal("unknown_code") }),
  notPermittedOutcome,
  notSignedInOutcome,
  notOfferedOutcome,
]);
export type FindCountableProductOutcome = z.infer<typeof findCountableProductOutcomeSchema>;

export const searchCountableProductsOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("results"),
    products: z
      .array(
        z.object({
          product_id: z.string(),
          name: z.string(),
          sale_unit: z.enum(SALE_UNITS),
          matches: z.array(z.object({ start: z.int().nonnegative(), length: z.int().positive() })),
        }),
      )
      .max(SEARCH_RESULT_LIMIT),
    more: z.boolean(),
  }),
  notPermittedOutcome,
  notSignedInOutcome,
  notOfferedOutcome,
]);
export type SearchCountableProductsOutcome = z.infer<typeof searchCountableProductsOutcomeSchema>;

export const weighCountedProductOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("weighed"), weight_thousandths: countedQuantitySchema }),
  z.object({ kind: z.literal("weighing") }),
  z.object({ kind: z.literal("scale_unavailable") }),
  z.object({ kind: z.literal("unknown_product") }),
  z.object({ kind: z.literal("not_sold_by_weight") }),
  notPermittedOutcome,
  notSignedInOutcome,
  notOfferedOutcome,
]);
export type WeighCountedProductOutcome = z.infer<typeof weighCountedProductOutcomeSchema>;

export const stockCoreToRendererMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("read-initial-count-result"),
    request_id: requestId,
    outcome: readInitialCountOutcomeSchema,
  }),
  z.object({
    type: z.literal("record-initial-count-line-result"),
    request_id: requestId,
    outcome: recordInitialCountLineOutcomeSchema,
  }),
  z.object({
    type: z.literal("withdraw-initial-count-line-result"),
    request_id: requestId,
    outcome: withdrawInitialCountLineOutcomeSchema,
  }),
  z.object({
    type: z.literal("find-countable-product-result"),
    request_id: requestId,
    outcome: findCountableProductOutcomeSchema,
  }),
  z.object({
    type: z.literal("search-countable-products-result"),
    request_id: requestId,
    outcome: searchCountableProductsOutcomeSchema,
  }),
  z.object({
    type: z.literal("weigh-counted-product-result"),
    request_id: requestId,
    outcome: weighCountedProductOutcomeSchema,
  }),
]);
export type StockCoreToRendererMessage = z.infer<typeof stockCoreToRendererMessageSchema>;
