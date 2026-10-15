import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

// Every id travels in the query string, which proxies cap in length.
export const SNAPSHOT_VERIFICATION_QUERY_LIMIT = 50;

export const snapshotVerificationQuerySchema = z.object({
  generation_id: z
    .union([recordIdSchema(), z.array(recordIdSchema())])
    .transform((asked) => (Array.isArray(asked) ? asked : [asked]))
    .pipe(z.array(z.string()).min(1).max(SNAPSHOT_VERIFICATION_QUERY_LIMIT)),
});

export type SnapshotVerificationQuery = z.output<typeof snapshotVerificationQuerySchema>;

export const snapshotVerificationAnswerSchema = z.object({
  verified_generation_ids: z.array(recordIdSchema()),
});

export type SnapshotVerificationAnswerBody = z.output<typeof snapshotVerificationAnswerSchema>;
