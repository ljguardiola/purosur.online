import { z } from "zod";
import {
  authorizationRefusalSchema,
  authorizationSchema,
  requestIdSchema,
} from "../shared/index.js";
import {
  addProductOutcomeSchema,
  cancelSaleOutcomeSchema,
  cashChargeSchema,
  changeLineQuantityOutcomeSchema,
  chargeSaleByTransferOutcomeSchema,
  chargeSaleInCashOutcomeSchema,
  removeSaleLineOutcomeSchema,
  saleLineQuantitySchema,
  saleSchema,
  scanProductOutcomeSchema,
  searchProductsOutcomeSchema,
} from "./sale.js";

const requestId = requestIdSchema;

const scanProductMessageSchema = z.object({
  type: z.literal("scan-product"),
  request_id: requestId,
  code: z.string().min(1),
});

const changeLineQuantityMessageSchema = z.object({
  type: z.literal("change-line-quantity"),
  request_id: requestId,
  line_id: z.string(),
  quantity: saleLineQuantitySchema,
  expected_quantity: saleLineQuantitySchema,
});

const removeSaleLineMessageSchema = z.object({
  type: z.literal("remove-sale-line"),
  request_id: requestId,
  line_id: z.string(),
});

const cancelSaleMessageSchema = z.object({
  type: z.literal("cancel-sale"),
  request_id: requestId,
});

const searchProductsMessageSchema = z.object({
  type: z.literal("search-products"),
  request_id: requestId,
  query: z.string(),
});

const addProductMessageSchema = z.object({
  type: z.literal("add-product"),
  request_id: requestId,
  product_id: z.string(),
});

const saleRequestMessageSchema = z.object({
  type: z.literal("sale-request"),
  request_id: requestId,
});

export const chargeSaleInCashMessageSchema = z.object({
  type: z.literal("charge-sale-in-cash"),
  request_id: requestId,
  sale_id: z.string(),
  tendered: z.int(),
});

export const chargeSaleByTransferMessageSchema = z.object({
  type: z.literal("charge-sale-by-transfer"),
  request_id: requestId,
  sale_id: z.string(),
  amount: z.int(),
});

const cashChargeRequestMessageSchema = z.object({
  type: z.literal("cash-charge-request"),
  request_id: requestId,
  sale_id: z.string(),
  tendered: z.int(),
});

const cancelLockedSaleMessageSchema = z.object({
  type: z.literal("cancel-locked-sale"),
  request_id: requestId,
  closer: authorizationSchema,
});

export const salesRendererToCoreMessageSchema = z.discriminatedUnion("type", [
  scanProductMessageSchema,
  changeLineQuantityMessageSchema,
  removeSaleLineMessageSchema,
  cancelSaleMessageSchema,
  searchProductsMessageSchema,
  addProductMessageSchema,
  saleRequestMessageSchema,
  chargeSaleInCashMessageSchema,
  chargeSaleByTransferMessageSchema,
  cashChargeRequestMessageSchema,
  cancelLockedSaleMessageSchema,
]);
export type SalesRendererToCoreMessage = z.infer<typeof salesRendererToCoreMessageSchema>;

const cancelLockedSaleOutcomeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("cancelled") }),
  z.object({ kind: z.literal("has_approved_payment") }),
  z.object({ kind: z.literal("no_open_sale") }),
  z.object({ kind: z.literal("no_open_session") }),
  ...authorizationRefusalSchema.options,
  z.object({ kind: z.literal("not_locked") }),
]);
export type CancelLockedSaleOutcome = z.infer<typeof cancelLockedSaleOutcomeSchema>;

export const salesCoreToRendererMessageSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("scan-product-result"),
    request_id: requestId,
    outcome: scanProductOutcomeSchema,
  }),
  z.object({
    type: z.literal("change-line-quantity-result"),
    request_id: requestId,
    outcome: changeLineQuantityOutcomeSchema,
  }),
  z.object({
    type: z.literal("remove-sale-line-result"),
    request_id: requestId,
    outcome: removeSaleLineOutcomeSchema,
  }),
  z.object({
    type: z.literal("cancel-sale-result"),
    request_id: requestId,
    outcome: cancelSaleOutcomeSchema,
  }),
  z.object({
    type: z.literal("search-products-result"),
    request_id: requestId,
    outcome: searchProductsOutcomeSchema,
  }),
  z.object({
    type: z.literal("add-product-result"),
    request_id: requestId,
    outcome: addProductOutcomeSchema,
  }),
  z.object({
    type: z.literal("charge-sale-in-cash-result"),
    request_id: requestId,
    outcome: chargeSaleInCashOutcomeSchema,
  }),
  z.object({
    type: z.literal("charge-sale-by-transfer-result"),
    request_id: requestId,
    outcome: chargeSaleByTransferOutcomeSchema,
  }),
  z.object({
    type: z.literal("cancel-locked-sale-result"),
    request_id: requestId,
    outcome: cancelLockedSaleOutcomeSchema,
  }),
  z.object({ type: z.literal("sale"), request_id: requestId, sale: saleSchema.nullable() }),
  z.object({ type: z.literal("sale-unavailable"), request_id: requestId }),
  z.object({ type: z.literal("sale-not-permitted"), request_id: requestId }),
  z.object({
    type: z.literal("cash-charge"),
    request_id: requestId,
    charge: cashChargeSchema.nullable(),
  }),
  z.object({ type: z.literal("cash-charge-unavailable"), request_id: requestId }),
  z.object({ type: z.literal("cash-charge-not-permitted"), request_id: requestId }),
]);
export type SalesCoreToRendererMessage = z.infer<typeof salesCoreToRendererMessageSchema>;
