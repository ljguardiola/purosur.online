import { z } from "zod";

const FOUR_LOWERCASE_HEX_DIGITS = /^[0-9a-f]{4}$/;

export const serialDeviceIdentitySchema = z.object({
  vendor_id: z.string().regex(FOUR_LOWERCASE_HEX_DIGITS),
  product_id: z.string().regex(FOUR_LOWERCASE_HEX_DIGITS),
});
