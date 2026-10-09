import { z } from "zod";

export const checkPinCodeRedemptionMessageSchema = z.object({
  type: z.literal("check-pin-code-redemption"),
  request_id: z.string(),
  reset_code: z.string(),
  new_pin: z.string(),
});

export const pinCodeRedemptionCheckMessageSchema = z.object({
  type: z.literal("pin-code-redemption-check"),
  request_id: z.string(),
  fields: z.array(z.enum(["reset_code", "new_pin"])),
});
