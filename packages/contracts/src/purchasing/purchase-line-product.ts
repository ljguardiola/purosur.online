import { SALE_UNITS } from "@purosur/domain";
import { z } from "zod";
import { netContentSchema } from "../shared/index.js";

export const purchaseLineProductSchema = z.object({
  id: z.string(),
  name: z.string(),
  brandName: z.string().nullable(),
  netContent: netContentSchema.nullable(),
  saleUnit: z.enum(SALE_UNITS),
});
