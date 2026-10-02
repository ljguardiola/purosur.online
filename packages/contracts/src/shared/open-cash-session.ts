import { REGISTER_ABILITIES } from "@purosur/domain";
import { z } from "zod";

export const signedInPersonSchema = z.object({
  user_id: z.string(),
  first_name: z.string(),
  abilities: z.array(z.enum(REGISTER_ABILITIES)),
});

export const openCashSessionSchema = z.object({
  id: z.string(),
  opened_at: z.string(),
  opened_by: signedInPersonSchema,
  locked: z.boolean(),
});
export type OpenCashSession = z.infer<typeof openCashSessionSchema>;
