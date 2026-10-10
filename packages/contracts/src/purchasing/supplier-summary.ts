import { z } from "zod";

export const supplierSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  cuit: z.string().nullable(),
  contact: z.string().nullable(),
  note: z.string().nullable(),
  active: z.boolean(),
  version: z.int(),
});

export const supplierListSchema = z.array(supplierSummarySchema);

export type SupplierSummary = z.output<typeof supplierSummarySchema>;
