import type { z } from "zod";
import { passkeyNameSchema, passkeyRegistrationSchema } from "./passkey-fields.js";
import { recoveryTokenBodySchema } from "./recovery-token.js";

export const recoveryRedemptionBodySchema = recoveryTokenBodySchema.extend({
  passkey_registration: passkeyRegistrationSchema,
  passkey_name: passkeyNameSchema,
});

export type RecoveryRedemptionBody = z.input<typeof recoveryRedemptionBodySchema>;
