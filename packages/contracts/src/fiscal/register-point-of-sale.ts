import { isPointOfSaleNumber } from "@purosur/domain";
import { z } from "zod";

const pointOfSaleNumberSchema = z.int().refine(isPointOfSaleNumber);

export const registerPointOfSaleSchema = z.object({
  register_id: z.string(),
  point_of_sale_number: pointOfSaleNumberSchema,
  fiscal_address_id: z.string(),
  version: z.int(),
});

export const registerPointOfSaleOverviewSchema = z.object({
  register_id: z.string(),
  register_name: z.string(),
  point_of_sale_number: pointOfSaleNumberSchema.nullable(),
  fiscal_address_id: z.string().nullable(),
  version: z.int(),
});

export const registerPointOfSaleOverviewListSchema = z.array(registerPointOfSaleOverviewSchema);

export type RegisterPointOfSaleBody = z.output<typeof registerPointOfSaleSchema>;

export type RegisterPointOfSaleOverviewBody = z.output<typeof registerPointOfSaleOverviewSchema>;
