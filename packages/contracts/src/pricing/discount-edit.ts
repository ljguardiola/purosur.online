import { z } from "zod";
import { loadedVersionSchema } from "../shared/index.js";
import { discountCreationBodySchema } from "./discount-creation.js";

export const discountEditBodySchema = discountCreationBodySchema.and(
  z.object({
    version: loadedVersionSchema,
    active: z.boolean({ error: "active must be true or false" }),
  }),
);

export type DiscountEditBody = z.input<typeof discountEditBodySchema>;
