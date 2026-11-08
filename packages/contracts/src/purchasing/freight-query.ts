import { FREIGHT_DESCRIPTION_MAX_LENGTH, isFreightDescriptionTooLong } from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";
import { freightPeriodSchema } from "./freight-period.js";
import { optionalLimitedTextSchema } from "./optional-text.js";

export const freightListQuerySchema = z.object({
  period: freightPeriodSchema,
  search: optionalLimitedTextSchema(
    "search",
    FREIGHT_DESCRIPTION_MAX_LENGTH,
    isFreightDescriptionTooLong,
  ).transform((search) => search ?? undefined),
  supplierId: recordIdSchema("supplierId must be a supplier's id").optional(),
});

export type FreightListQuery = z.input<typeof freightListQuerySchema>;

export const linkablePurchasesQuerySchema = z.object({
  period: freightPeriodSchema,
  freightId: recordIdSchema("freightId must be a freight's id").optional(),
});
