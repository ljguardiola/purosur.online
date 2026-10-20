import { z } from "zod";
import { loadedVersionSchema } from "../shared/index.js";

export const supplierPriceListRowRemovalBodySchema = z.object({ version: loadedVersionSchema });

export type SupplierPriceListRowRemovalBody = z.input<typeof supplierPriceListRowRemovalBodySchema>;
