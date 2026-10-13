import {
  FREIGHT_DESCRIPTION_MAX_LENGTH,
  FREIGHT_PERIOD_DAYS,
  isFreightDescriptionTooLong,
} from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";
import { optionalLimitedTextSchema } from "./optional-text.js";

const periodSchema = z.coerce
  .number()
  .pipe(z.literal(FREIGHT_PERIOD_DAYS))
  .default(FREIGHT_PERIOD_DAYS[0]);

export const freightListQuerySchema = z.object({
  period: periodSchema,
  search: optionalLimitedTextSchema(
    "search",
    FREIGHT_DESCRIPTION_MAX_LENGTH,
    isFreightDescriptionTooLong,
  ).transform((search) => search ?? undefined),
});

export const linkablePurchasesQuerySchema = z.object({
  period: periodSchema,
  freightId: recordIdSchema("freightId must be a freight's id").optional(),
});
