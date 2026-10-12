import {
  INITIAL_COUNT_COST_FILTERS,
  isCalendarDay,
  isReferenceUnitCost,
  MAX_CASH_AMOUNT_CENTS,
  SALE_UNITS,
} from "@purosur/domain";
import { z } from "zod";

export const initialInventoryLotsQuerySchema = z
  .object({
    cost: z
      .enum(INITIAL_COUNT_COST_FILTERS, { error: "cost must be known or incomplete" })
      .optional(),
    product: z.string().trim().optional(),
  })
  .transform(({ cost, product }) => ({
    ...(cost === undefined ? {} : { cost }),
    ...(product === undefined || product === "" ? {} : { product }),
  }));

export type InitialInventoryLotsQuery = z.input<typeof initialInventoryLotsQuerySchema>;

export const initialInventoryLotListSchema = z.object({
  lots: z.array(
    z.object({
      lotId: z.string(),
      productId: z.string(),
      productName: z.string(),
      categoryName: z.string(),
      saleUnit: z.enum(SALE_UNITS),
      expiresOn: z.string().refine(isCalendarDay).nullable(),
      counted: z.int(),
      costIncomplete: z.boolean(),
      unitCostCents: z.int().nullable(),
      valueCents: z.int().nullable(),
    }),
  ),
});

export type InitialInventoryLotList = z.output<typeof initialInventoryLotListSchema>;

const UNIT_COST_MESSAGE = "unitCostCents must be a positive whole number of cents";

export const lotReferenceCostBodySchema = z.object({
  unitCostCents: z
    .number({ error: UNIT_COST_MESSAGE })
    .refine((cents) => Number.isInteger(cents) && isReferenceUnitCost(cents), UNIT_COST_MESSAGE)
    .meta({ maxValue: MAX_CASH_AMOUNT_CENTS }),
});

export type LotReferenceCostBody = z.input<typeof lotReferenceCostBodySchema>;
