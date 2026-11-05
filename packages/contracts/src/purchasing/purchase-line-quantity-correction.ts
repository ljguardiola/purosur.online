import { z } from "zod";
import { packageCountFields } from "./package-count-fields.js";
import { lineQuantitySchema } from "./purchase-registration.js";

export const purchaseLineQuantityCorrectionBodySchema = z.discriminatedUnion("loadedBy", [
  z.object({ loadedBy: z.literal("packages"), packages: packageCountFields.packages }),
  z.object({ loadedBy: z.literal("quantity"), quantity: lineQuantitySchema }),
]);

export type PurchaseLineQuantityCorrectionBody = z.input<
  typeof purchaseLineQuantityCorrectionBodySchema
>;
