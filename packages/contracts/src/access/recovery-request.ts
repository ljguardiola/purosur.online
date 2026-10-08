import { z } from "zod";
import { emailAddressSchema } from "../shared/index.js";

export const recoveryRequestBodySchema = z.object({ email: emailAddressSchema });

export type RecoveryRequestBody = z.input<typeof recoveryRequestBodySchema>;
