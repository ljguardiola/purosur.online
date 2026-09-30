import {
  ADJUSTMENT_REASONS,
  adjustmentDirections,
  LOSS_REASONS,
  MAX_STOCK_QUANTITY,
  STOCK_DIRECTIONS,
} from "@purosur/domain";
import { z } from "zod";

const PRODUCT_ID_MESSAGE = "productId must be an active product's id";
const QUANTITY_MESSAGE = "quantity must be a positive integer number of thousandths";
const COUNTED_MESSAGE = "counted must be a non-negative integer number of thousandths";

const productId = z.guid({ error: PRODUCT_ID_MESSAGE });

const quantity = z
  .number({ error: QUANTITY_MESSAGE })
  .int(QUANTITY_MESSAGE)
  .min(1, QUANTITY_MESSAGE)
  .max(MAX_STOCK_QUANTITY, QUANTITY_MESSAGE);

export const stockLossBodySchema = z.object({
  productId,
  reason: z.enum(LOSS_REASONS, { error: "reason must be one of the loss reasons" }),
  quantity,
});

export type StockLossBody = z.input<typeof stockLossBodySchema>;

export const stockAdjustmentBodySchema = z
  .object({
    productId,
    reason: z.enum(ADJUSTMENT_REASONS, { error: "reason must be one of the adjustment reasons" }),
    direction: z.enum(STOCK_DIRECTIONS, { error: "direction must be add or subtract" }),
    quantity,
  })
  .refine((body) => adjustmentDirections(body.reason).includes(body.direction), {
    path: ["direction"],
    error: "this reason only subtracts",
  });

export type StockAdjustmentBody = z.input<typeof stockAdjustmentBodySchema>;

export const stockCountBodySchema = z.object({
  productId,
  counted: z
    .number({ error: COUNTED_MESSAGE })
    .int(COUNTED_MESSAGE)
    .min(0, COUNTED_MESSAGE)
    .max(MAX_STOCK_QUANTITY, COUNTED_MESSAGE),
  occurredAt: z.iso.datetime({ offset: true, error: "occurredAt must be an ISO date and time" }),
});

export type StockCountBody = z.input<typeof stockCountBodySchema>;
