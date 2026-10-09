import { isPasskeyNameTooLong, PASSKEY_NAME_MAX_LENGTH } from "@purosur/domain";
import { z } from "zod";

const NAME_MESSAGE = "passkey_name is required and must be 1-40 characters once trimmed";

export const passkeyRegistrationSchema = z.custom<NonNullable<unknown>>(
  (value) => Boolean(value),
  "passkey_registration is required",
);

export const passkeyNameSchema = z
  .string({ error: NAME_MESSAGE })
  .trim()
  .min(1, NAME_MESSAGE)
  .refine((name) => !isPasskeyNameTooLong(name), NAME_MESSAGE)
  .meta({ maxLength: PASSKEY_NAME_MAX_LENGTH });
