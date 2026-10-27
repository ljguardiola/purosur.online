import { z } from "zod";
import { loadedVersionSchema } from "../shared/index.js";

export const supplierPriceListRowReviewBodySchema = z.object({ version: loadedVersionSchema });

export type SupplierPriceListRowReviewBody = z.input<typeof supplierPriceListRowReviewBodySchema>;
