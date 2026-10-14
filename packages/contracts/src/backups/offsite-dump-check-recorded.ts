import { OFFSITE_DUMP_FAILURE_REASONS } from "@purosur/domain";
import { z } from "zod";
import { offsiteDumpNightSchema } from "./offsite-dump-night.js";

export const offsiteDumpCheckRecordedSchema = z.discriminatedUnion("status", [
  z.object({
    night: offsiteDumpNightSchema,
    status: z.literal("verified"),
    sizeBytes: z.number().int().nonnegative(),
  }),
  z.object({
    night: offsiteDumpNightSchema,
    status: z.literal("failed"),
    reason: z.enum(OFFSITE_DUMP_FAILURE_REASONS),
  }),
]);

export type OffsiteDumpCheckRecorded = z.output<typeof offsiteDumpCheckRecordedSchema>;
