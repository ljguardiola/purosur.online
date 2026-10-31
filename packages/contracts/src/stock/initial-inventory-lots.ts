import {
  INITIAL_COUNT_COST_FILTERS,
  isCalendarDay,
  isReferenceUnitCost,
  MAX_CASH_AMOUNT_CENTS,
  SALE_UNITS,
} from "@purosur/domain";
import { z } from "zod";
import { netContentSchema, recordIdSchema } from "../shared/index.js";

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
      brandName: z.string().nullable(),
      netContent: netContentSchema.nullable(),
      categoryName: z.string(),
      saleUnit: z.enum(SALE_UNITS),
      expiresOn: z.string().refine(isCalendarDay).nullable(),
      counted: z.int(),
      withdrawn: z.boolean(),
      remaining: z.int(),
      costIncomplete: z.boolean(),
      unitCostCents: z.int().nullable(),
      valueCents: z.int().nullable(),
      supplierPrices: z.array(
        z.object({
          supplierItemId: z.string(),
          supplierName: z.string(),
          quantity: z.int(),
          saleUnit: z.enum(SALE_UNITS),
          listDate: z.string().refine(isCalendarDay),
          unitCostCents: z.int(),
          cheapest: z.boolean(),
          current: z.boolean(),
        }),
      ),
    }),
  ),
});

export type InitialInventoryLotList = z.output<typeof initialInventoryLotListSchema>;

const UNIT_COST_MESSAGE = "unitCostCents must be a positive whole number of cents";
const SUPPLIER_ITEM_MESSAGE = "supplierItemId must be a supplier item's id";

const typedLotReferenceCostSchema = z.object({
  unitCostCents: z
    .unknown()
    .refine(
      (cents): cents is number =>
        typeof cents === "number" && Number.isInteger(cents) && isReferenceUnitCost(cents),
      UNIT_COST_MESSAGE,
    )
    .meta({ maxValue: MAX_CASH_AMOUNT_CENTS }),
  supplierItemId: z.never().optional(),
});

const suppliedLotReferenceCostSchema = z.object({
  supplierItemId: z
    .unknown()
    .nonoptional()
    .refine((id): id is string => typeof id === "string", SUPPLIER_ITEM_MESSAGE)
    .pipe(recordIdSchema(SUPPLIER_ITEM_MESSAGE)),
});

export const lotReferenceCostBodySchema = z.union(
  [typedLotReferenceCostSchema, suppliedLotReferenceCostSchema],
  { error: SUPPLIER_ITEM_MESSAGE },
);

export type LotReferenceCostBody = z.input<typeof lotReferenceCostBodySchema>;
