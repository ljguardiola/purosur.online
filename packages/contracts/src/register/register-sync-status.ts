import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { z } from "zod";

export const registerSyncStatusSchema = z.object({
  id: z.string(),
  name: z.string(),
  last_successful_sync_at: z.string().nullable().meta({ timeZone: ARGENTINA_TIME_ZONE }),
});

export const registerSyncStatusListSchema = z.array(registerSyncStatusSchema);

export type RegisterSyncStatusWire = z.output<typeof registerSyncStatusSchema>;
