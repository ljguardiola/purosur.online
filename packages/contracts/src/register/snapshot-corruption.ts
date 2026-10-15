import { SNAPSHOT_CORRUPTION_STAGES } from "@purosur/domain";
import { z } from "zod";

export const snapshotCorruptionBodySchema = z.strictObject({
  stage: z.enum(SNAPSHOT_CORRUPTION_STAGES),
});

export type SnapshotCorruptionBody = z.output<typeof snapshotCorruptionBodySchema>;
