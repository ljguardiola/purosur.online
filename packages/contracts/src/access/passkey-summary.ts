import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { z } from "zod";

export const passkeySummarySchema = z.object({
  id: z.string(),
  name: z.string(),
  created_at: z.string().meta({ timeZone: ARGENTINA_TIME_ZONE }),
  last_used_at: z.string().nullable().meta({ timeZone: ARGENTINA_TIME_ZONE }),
});

export const passkeyListSchema = z.array(passkeySummarySchema);

export type PasskeySummaryWire = z.output<typeof passkeySummarySchema>;
