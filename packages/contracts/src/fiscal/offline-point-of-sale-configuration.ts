import type { z } from "zod";
import { pointOfSaleConfigurationBodySchema } from "./point-of-sale-configuration.js";

export const offlinePointOfSaleConfigurationBodySchema = pointOfSaleConfigurationBodySchema.pick({
  point_of_sale_number: true,
  version: true,
});

export type OfflinePointOfSaleConfigurationBody = z.input<
  typeof offlinePointOfSaleConfigurationBodySchema
>;
