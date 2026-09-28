import { z } from "zod";
import { emailAddressSchema } from "./email-address.js";

export const recoveryRequestBodySchema = z.object({ email: emailAddressSchema });

export type RecoveryRequestBody = z.input<typeof recoveryRequestBodySchema>;
