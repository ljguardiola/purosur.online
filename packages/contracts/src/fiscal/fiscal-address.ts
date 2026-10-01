import { z } from "zod";

export const fiscalAddressSchema = z.object({
  id: z.string(),
  name: z.string(),
  street_address: z.string(),
  version: z.int(),
});

export const fiscalAddressListSchema = z.array(fiscalAddressSchema);

export type FiscalAddressBody = z.output<typeof fiscalAddressSchema>;
