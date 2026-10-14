import { OFFSITE_DUMP_REPORTED_FAILURE_REASONS } from "@purosur/domain";
import { z } from "zod";
import { offsiteDumpNightSchema } from "./offsite-dump-night.js";

export const offsiteDumpCheckReportSchema = z.discriminatedUnion("outcome", [
  z.object({
    night: offsiteDumpNightSchema,
    outcome: z.literal("passed"),
    sizeBytes: z.number().int().nonnegative(),
  }),
  z.object({
    night: offsiteDumpNightSchema,
    outcome: z.literal("failed"),
    reason: z.enum(OFFSITE_DUMP_REPORTED_FAILURE_REASONS),
  }),
]);

export type OffsiteDumpCheckReport = z.output<typeof offsiteDumpCheckReportSchema>;
