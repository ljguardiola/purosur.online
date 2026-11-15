import { z } from "zod";

export const alertEmailOptInSchema = z.object({
  opted_in_at: z.iso.datetime().nullable(),
});

export type AlertEmailOptInWire = z.output<typeof alertEmailOptInSchema>;
