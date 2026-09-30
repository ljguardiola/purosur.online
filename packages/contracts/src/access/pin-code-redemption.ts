import {
  isAcceptablePin,
  isWellFormedPinCode,
  normalizePinCode,
  PIN_MIN_DIGITS,
} from "@purosur/domain";
import { z } from "zod";

const RESET_CODE_MESSAGE = "reset_code must be 16 base32 characters";
const NEW_PIN_MESSAGE = "new_pin must be a string";
const ACCEPTABLE_PIN_MESSAGE = `new_pin must be at least ${PIN_MIN_DIGITS} digits, numbers only`;

export const newPinSchema = z
  .string({ error: ACCEPTABLE_PIN_MESSAGE })
  .refine(isAcceptablePin, ACCEPTABLE_PIN_MESSAGE);

export const pinCodeRedemptionBodySchema = z.object({
  reset_code: z
    .string({ error: RESET_CODE_MESSAGE })
    .transform(normalizePinCode)
    .refine(isWellFormedPinCode, RESET_CODE_MESSAGE),
  new_pin: z.string({ error: NEW_PIN_MESSAGE }),
});

export type PinCodeRedemptionBody = z.input<typeof pinCodeRedemptionBodySchema>;

export const pinCodeRedemptionSchema = z.object({
  user_id: z.uuid(),
  salt: z.string(),
  pin_hash: z.string(),
});

export type PinCodeRedemption = z.output<typeof pinCodeRedemptionSchema>;

export { PIN_MIN_DIGITS };
