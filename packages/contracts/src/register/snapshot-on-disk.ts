import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

export const snapshotsOnDiskBodySchema = z.strictObject({
  generation_ids: z.array(recordIdSchema()),
});

export type SnapshotsOnDiskBody = z.output<typeof snapshotsOnDiskBodySchema>;
