import { isPriceListRowPrice } from "@purosur/domain";
import { z } from "zod";
import { loadedVersionSchema } from "../shared/index.js";

const PRICE_MESSAGE = "priceCents must be a whole number of cents, not negative";

export const supplierPriceListRowPriceBodySchema = z.object({
  priceCents: z.number({ error: PRICE_MESSAGE }).refine(isPriceListRowPrice, PRICE_MESSAGE),
  version: loadedVersionSchema,
});

export type SupplierPriceListRowPriceBody = z.input<typeof supplierPriceListRowPriceBodySchema>;
