import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { z } from "zod";
import { pointOfSaleNumberSchema } from "../shared/index.js";

const branchOfflinePointOfSaleSchema = z.object({
  point_of_sale_number: pointOfSaleNumberSchema,
  register_id: z.string(),
  register_name: z.string(),
  retirable: z.boolean(),
  retired_at: z.iso.datetime().nullable().meta({ timeZone: ARGENTINA_TIME_ZONE }),
});

export const branchOfflinePointOfSaleListSchema = z.array(branchOfflinePointOfSaleSchema);

export const offlinePointOfSaleRetirementSchema = z.object({
  point_of_sale_number: pointOfSaleNumberSchema,
  retired_at: z.iso.datetime(),
});

export type BranchOfflinePointOfSaleBody = z.output<typeof branchOfflinePointOfSaleSchema>;
