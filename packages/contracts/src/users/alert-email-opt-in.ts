import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { z } from "zod";

export const alertEmailOptInSchema = z.object({
  opted_in_at: z.iso.datetime().nullable().meta({ timeZone: ARGENTINA_TIME_ZONE }),
});

export type AlertEmailOptInWire = z.output<typeof alertEmailOptInSchema>;
