import type { z } from "zod";
import { loadedVersionSchema } from "../shared/index.js";
import { supplierCreationBodySchema } from "./supplier-creation.js";

export const supplierEditBodySchema = supplierCreationBodySchema.extend({
  version: loadedVersionSchema,
});

export type SupplierEditBody = z.input<typeof supplierEditBodySchema>;
