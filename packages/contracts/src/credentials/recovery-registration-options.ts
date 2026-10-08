import { z } from "zod";
import { creationOptionsSchema } from "./webauthn-options.js";

export const recoveryRegistrationOptionsSchema = z.object({
  passkey_registration_options: creationOptionsSchema,
  display_name: z.string(),
});

export type RecoveryRegistrationOptionsWire = z.output<typeof recoveryRegistrationOptionsSchema>;
