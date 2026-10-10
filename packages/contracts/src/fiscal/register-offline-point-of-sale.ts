import { z } from "zod";
import { pointOfSaleNumberSchema } from "../shared/index.js";

export const registerOfflinePointOfSaleSchema = z.object({
  register_id: z.string(),
  point_of_sale_number: pointOfSaleNumberSchema,
  version: z.int(),
});

export type RegisterOfflinePointOfSaleBody = z.output<typeof registerOfflinePointOfSaleSchema>;
