import { z } from "zod";
import { passkeyNameSchema, passkeyRegistrationSchema } from "./passkey-fields.js";

export const passkeyRegistrationBodySchema = z.object({
  passkey_registration: passkeyRegistrationSchema,
  passkey_name: passkeyNameSchema,
});

export type PasskeyRegistrationBody = z.input<typeof passkeyRegistrationBodySchema>;
