import { ARGENTINA_TIME_ZONE } from "@purosur/domain";
import { z } from "zod";

const registerBatterySchema = z.discriminatedUnion("present", [
  z.object({ present: z.literal(false) }),
  z.object({
    present: z.literal(true),
    charge_percent: z.int().min(0).max(100),
    on_battery: z.boolean(),
    on_battery_minutes: z.int().nonnegative(),
    health_percent: z.int().nonnegative().optional(),
    worn: z.boolean(),
  }),
]);

const registerDiskSchema = z.object({
  free_bytes: z.int().nonnegative(),
  free_ratio: z.number().min(0).max(1),
});

export const registerSyncStatusSchema = z.object({
  id: z.string(),
  name: z.string(),
  last_successful_sync_at: z.string().nullable().meta({ timeZone: ARGENTINA_TIME_ZONE }),
  battery: registerBatterySchema.nullable(),
  disk: registerDiskSchema.nullable(),
});

export const registerSyncStatusListSchema = z.array(registerSyncStatusSchema);

export type RegisterSyncStatusWire = z.output<typeof registerSyncStatusSchema>;
