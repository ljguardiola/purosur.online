import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";
import {
  snapshotKeyVersionSchema,
  snapshotSha256Schema,
  snapshotSizeSchema,
} from "./snapshot-upload.js";

const restorableSnapshotSchema = z.object({
  generation_id: recordIdSchema(),
  created_at: z.iso.datetime(),
  size: snapshotSizeSchema,
  sha256: snapshotSha256Schema,
  key_version: snapshotKeyVersionSchema,
  download_url: z.url({ protocol: /^https$/ }),
});

export const restorableSnapshotsSchema = z.object({
  generations: z.array(restorableSnapshotSchema),
});

export type RestorableSnapshots = z.output<typeof restorableSnapshotsSchema>;
