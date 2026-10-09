import { z } from "zod";
import { passkeyAssertionSchema } from "./passkey-assertion.js";

export const sessionAuthenticationBodySchema = z.object({ assertion: passkeyAssertionSchema });

export type SessionAuthenticationBody = z.input<typeof sessionAuthenticationBodySchema>;
