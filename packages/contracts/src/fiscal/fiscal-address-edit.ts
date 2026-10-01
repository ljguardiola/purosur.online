import type { z } from "zod";
import { loadedVersionSchema } from "../shared/index.js";
import { fiscalAddressCreationBodySchema } from "./fiscal-address-creation.js";

export const fiscalAddressEditBodySchema = fiscalAddressCreationBodySchema.extend({
  version: loadedVersionSchema,
});

export type FiscalAddressEditBody = z.input<typeof fiscalAddressEditBodySchema>;
