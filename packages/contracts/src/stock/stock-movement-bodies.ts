import {
  ADJUSTMENT_REASONS,
  ARGENTINA_TIME_ZONE,
  adjustmentDirections,
  argentinaInstant,
  isCalendarDay,
  LOSS_REASONS,
  mayBeCountedQuantity,
  mayBeCountedTogether,
  mayBeMovementQuantity,
  STOCK_DIRECTIONS,
  STOCK_QUANTITY_DECIMALS,
  STOCK_QUANTITY_PER_UNIT,
} from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

const PRODUCT_ID_MESSAGE = "productId must be a product's id";
const QUANTITY_MESSAGE = "quantity must be a positive integer number of thousandths";
const COUNTED_MESSAGE = "counted must be a non-negative integer number of thousandths";

const productId = recordIdSchema(PRODUCT_ID_MESSAGE);

const QUANTITY_UNITS = { decimals: STOCK_QUANTITY_DECIMALS, perUnit: STOCK_QUANTITY_PER_UNIT };

const quantity = z
  .number({ error: QUANTITY_MESSAGE })
  .refine(mayBeMovementQuantity, QUANTITY_MESSAGE)
  .meta(QUANTITY_UNITS);

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

const countedQuantity = z
  .number({ error: COUNTED_MESSAGE })
  .refine(mayBeCountedQuantity, COUNTED_MESSAGE);

export const stockCountBodySchema = z.object({
  productId,
  counted: countedQuantity.optional().meta(QUANTITY_UNITS),
  lots: z
    .array(
      z.object({ lotId: recordIdSchema("lotId must be a lot's id"), counted: countedQuantity }),
    )
    .min(1, "lots must list at least one lot")
    .refine(mayBeCountedTogether, "lots must add up to at most the largest quantity a count holds")
    .optional(),
  occurredAt: z.iso
    .datetime({ offset: true, error: "occurredAt must be an ISO date and time" })
    .meta({ timeZone: ARGENTINA_TIME_ZONE }),
});

export type StockCountBody = z.input<typeof stockCountBodySchema>;

export const stockCountMomentSchema = z
  .object({
    day: z.string().refine(isCalendarDay),
    time: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/),
  })
  .transform(({ day, time }) => argentinaInstant(day, time));
