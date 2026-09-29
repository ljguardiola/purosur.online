import { z } from "zod";

export const registerSummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  pending_code: z
    .object({
      issued_at: z.string(),
      expires_at: z.string(),
    })
    .nullable(),
});

export const registerListSchema = z.array(registerSummarySchema);

export type RegisterSummaryBody = z.output<typeof registerSummarySchema>;
