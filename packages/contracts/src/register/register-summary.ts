import { z } from "zod";
import { pointOfSaleNumberSchema } from "../shared/index.js";

export const registerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  pending_code: z
    .object({
      seconds_since_issued: z.number().int().nonnegative(),
      seconds_until_expiry: z.number().int().positive(),
    })
    .nullable(),
  point_of_sale_number: pointOfSaleNumberSchema.nullable(),
});

export const registerListSchema = z.array(registerSummarySchema);

export type RegisterSummaryBody = z.output<typeof registerSummarySchema>;
