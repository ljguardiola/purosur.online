import { isOffsiteDumpNight, OFFSITE_DUMP_FAILURE_REASONS } from "@purosur/domain";
import { z } from "zod";

const night = z.string().refine(isOffsiteDumpNight, {
  message: "night must be a calendar day written YYYY-MM-DD",
});

export const offsiteDumpCheckRecordedSchema = z.discriminatedUnion("status", [
  z.object({
    night,
    status: z.literal("verified"),
    sizeBytes: z.number().int().nonnegative(),
  }),
  z.object({
    night,
    status: z.literal("failed"),
    reason: z.enum(OFFSITE_DUMP_FAILURE_REASONS),
  }),
]);

export type OffsiteDumpCheckRecorded = z.output<typeof offsiteDumpCheckRecordedSchema>;
