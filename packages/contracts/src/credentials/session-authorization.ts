import { z } from "zod";
import { passkeyAssertionSchema } from "./passkey-assertion.js";

export const sessionAuthorizationBodySchema = z.object({ authorization: passkeyAssertionSchema });

export type SessionAuthorizationBody = z.input<typeof sessionAuthorizationBodySchema>;
