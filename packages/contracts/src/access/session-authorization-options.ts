import { z } from "zod";
import { requestOptionsSchema } from "./webauthn-options.js";

export const sessionAuthorizationOptionsSchema = z.object({
  authorization_options: requestOptionsSchema,
});

export type SessionAuthorizationOptionsWire = z.output<typeof sessionAuthorizationOptionsSchema>;
