import { isCalendarDay, SALE_UNITS } from "@purosur/domain";
import { z } from "zod";
import { recipeSummarySchema } from "./recipe-summary.js";

const saleUnitSchema = z.enum(SALE_UNITS);
const calendarDay = z.string().refine(isCalendarDay);
const moment = z.iso.datetime();

const batchCostSchema = {
  unitCostCents: z.int().nullable(),
  costIncomplete: z.boolean(),
  expiresOn: calendarDay.nullable(),
};

export const assemblyBatchResultSchema = z.object({
  batch: z.object({
    id: z.string(),
    productId: z.string(),
    assembledAt: moment,
    output: z.int(),
    ...batchCostSchema,
  }),
});

export type AssemblyBatchResult = z.output<typeof assemblyBatchResultSchema>;

const assemblyBatchSchema = z.object({
  id: z.string(),
  productId: z.string(),
  productName: z.string(),
  saleUnit: saleUnitSchema,
  assembledAt: moment,
  output: z.int(),
  ...batchCostSchema,
  lines: z.array(
    z.object({
      componentProductId: z.string(),
      name: z.string(),
      saleUnit: saleUnitSchema,
      quantity: z.int(),
    }),
  ),
});

export const assemblyBatchListSchema = z.object({
  batches: z.array(assemblyBatchSchema),
  recipes: z.array(recipeSummarySchema),
});

export type AssemblyBatch = z.output<typeof assemblyBatchSchema>;
export type AssemblyBatchList = z.output<typeof assemblyBatchListSchema>;

const usedQuantitySchema = z.object({ componentProductId: z.string(), quantity: z.int() });

export const assemblyBatchPreviewSchema = z.object({
  recipeVersion: z.int(),
  proposal: z.object({ used: z.array(usedQuantitySchema), output: z.int().nullable() }),
  used: z.array(usedQuantitySchema),
  planned: z.array(
    z.object({
      componentProductId: z.string(),
      allocations: z.array(
        z.object({
          lotId: z.string().nullable(),
          quantity: z.int(),
          expiresOn: calendarDay.nullable(),
        }),
      ),
    }),
  ),
  lot: z
    .object({
      costTotalCents: z.int(),
      costQuantity: z.int(),
      ...batchCostSchema,
    })
    .nullable(),
});

export type AssemblyBatchPreview = z.output<typeof assemblyBatchPreviewSchema>;

const message = z.string();

export const assemblyBatchRefusalSchema = z.discriminatedUnion("code", [
  z.object({ code: z.literal("product_not_found"), message }),
  z.object({ code: z.literal("no_recipe"), message }),
  z.object({ code: z.literal("stale_recipe"), message }),
  z.object({ code: z.literal("invalid_size"), message }),
  z.object({ code: z.literal("nothing_used"), message }),
  z.object({ code: z.literal("invalid_output"), message }),
  z.object({ code: z.literal("invalid_quantity"), message, componentProductId: z.string() }),
]);

export type AssemblyBatchRefusal = z.output<typeof assemblyBatchRefusalSchema>;
