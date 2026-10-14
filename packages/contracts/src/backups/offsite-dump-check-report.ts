import { isOffsiteDumpNight, OFFSITE_DUMP_REPORTED_FAILURE_REASONS } from "@purosur/domain";
import { z } from "zod";

const night = z.string().refine(isOffsiteDumpNight, {
  message: "night must be a calendar day written YYYY-MM-DD",
});

export const offsiteDumpCheckReportSchema = z.discriminatedUnion("outcome", [
  z.object({
    night,
    outcome: z.literal("passed"),
    sizeBytes: z.number().int().nonnegative(),
  }),
  z.object({
    night,
    outcome: z.literal("failed"),
    reason: z.enum(OFFSITE_DUMP_REPORTED_FAILURE_REASONS),
  }),
]);

export type OffsiteDumpCheckReport = z.output<typeof offsiteDumpCheckReportSchema>;
