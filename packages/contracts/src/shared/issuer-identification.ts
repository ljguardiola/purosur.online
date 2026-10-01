import { z } from "zod";

export const issuerIdentificationSchema = z.object({
  legal_name: z.string().nullable(),
  gross_income_registration: z.string().nullable(),
  activity_start_date: z.string().nullable(),
  authorized_cuit: z.string(),
  tax_status: z.string(),
  version: z.int(),
});

export type IssuerIdentificationBody = z.output<typeof issuerIdentificationSchema>;
