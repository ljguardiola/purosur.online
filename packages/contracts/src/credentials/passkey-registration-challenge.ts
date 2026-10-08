import { z } from "zod";
import { creationOptionsSchema } from "./webauthn-options.js";

export const passkeyRegistrationChallengeSchema = z.object({
  passkey_registration_options: creationOptionsSchema,
});

export type PasskeyRegistrationChallengeWire = z.output<typeof passkeyRegistrationChallengeSchema>;
