import { z } from "zod";
import { pointOfSaleNumberSchema } from "../shared/index.js";

export const branchOfflinePointOfSaleSchema = z.object({
  point_of_sale_number: pointOfSaleNumberSchema,
  register_id: z.string(),
  register_name: z.string(),
  assigned: z.boolean(),
  retired_at: z.iso.datetime().nullable(),
});

export const branchOfflinePointOfSaleListSchema = z.array(branchOfflinePointOfSaleSchema);

export const offlinePointOfSaleRetirementSchema = z.object({
  point_of_sale_number: pointOfSaleNumberSchema,
  retired_at: z.iso.datetime(),
});

export type BranchOfflinePointOfSaleBody = z.output<typeof branchOfflinePointOfSaleSchema>;

export type OfflinePointOfSaleRetirementBody = z.output<typeof offlinePointOfSaleRetirementSchema>;
