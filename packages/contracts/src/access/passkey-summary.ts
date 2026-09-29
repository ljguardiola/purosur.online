import { z } from "zod";

export const passkeySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  created_at: z.string(),
  last_used_at: z.string().nullable(),
});

export const passkeyListSchema = z.array(passkeySummarySchema);

export type PasskeySummaryWire = z.output<typeof passkeySummarySchema>;
