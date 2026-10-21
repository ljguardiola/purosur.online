import { isCalendarDay } from "@purosur/domain";
import { z } from "zod";
import { loadedVersionSchema } from "../shared/index.js";
import { optionalTextSchema } from "./optional-text.js";

export const supplierPriceListConfirmationBodySchema = z.object({
  version: loadedVersionSchema,
  listDate: optionalTextSchema(
    "listDate must be a calendar day in the form YYYY-MM-DD",
    isCalendarDay,
  ),
  pricesIncludeVat: z
    .boolean()
    .nullish()
    .transform((answer) => answer ?? null),
});

export type SupplierPriceListConfirmationBody = z.input<
  typeof supplierPriceListConfirmationBodySchema
>;
