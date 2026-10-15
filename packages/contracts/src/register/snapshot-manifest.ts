import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";
import {
  snapshotKeyVersionSchema,
  snapshotSha256Schema,
  snapshotSizeSchema,
} from "./snapshot-upload.js";

const sequenceSchema = z.number().int().nonnegative();

export const snapshotManifestSchema = z.strictObject({
  generation_id: recordIdSchema(),
  created_at: z.iso.datetime(),
  last_device_seq: sequenceSchema,
  pull_cursor: sequenceSchema,
  key_version: snapshotKeyVersionSchema,
  size: snapshotSizeSchema,
  sha256: snapshotSha256Schema,
  uploaded_at: z.iso.datetime().nullable(),
  refused_at: z.iso.datetime().nullable(),
});

export type SnapshotManifest = z.output<typeof snapshotManifestSchema>;
