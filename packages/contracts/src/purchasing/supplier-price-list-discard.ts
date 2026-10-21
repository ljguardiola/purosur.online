import { z } from "zod";
import { loadedVersionSchema } from "../shared/index.js";

export const supplierPriceListDiscardBodySchema = z.object({ version: loadedVersionSchema });

export type SupplierPriceListDiscardBody = z.input<typeof supplierPriceListDiscardBodySchema>;
