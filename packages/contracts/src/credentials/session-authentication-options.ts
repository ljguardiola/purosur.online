import { z } from "zod";
import { requestOptionsSchema } from "./webauthn-options.js";

export const sessionAuthenticationOptionsSchema = z.object({
  passkey_authentication_options: requestOptionsSchema,
});

export type SessionAuthenticationOptionsWire = z.output<typeof sessionAuthenticationOptionsSchema>;
