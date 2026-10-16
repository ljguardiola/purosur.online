import { SNAPSHOT_CORRUPTION_STAGES } from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";
import { versionedKeySchema } from "./installation-keys.js";

const sequenceSchema = z.number().int().nonnegative();
const nonEmptyTextSchema = z.string().min(1);

const takeJobSchema = z.strictObject({
  kind: z.literal("take"),
  register_id: recordIdSchema(),
  generation_id: recordIdSchema(),
  key: versionedKeySchema,
  device_token: nonEmptyTextSchema,
  cloud_url: z.url(),
  database_path: nonEmptyTextSchema,
  snapshots_folder: nonEmptyTextSchema,
  last_device_seq: sequenceSchema,
  pull_cursor: sequenceSchema,
});

const uploadPendingJobSchema = z.strictObject({
  kind: z.literal("upload_pending"),
  device_token: nonEmptyTextSchema,
  cloud_url: z.url(),
  snapshots_folder: nonEmptyTextSchema,
});

export const snapshotWorkerJobSchema = z.discriminatedUnion("kind", [
  takeJobSchema,
  uploadPendingJobSchema,
]);

export type SnapshotWorkerJobMessage = z.output<typeof snapshotWorkerJobSchema>;

export const snapshotWorkerLaunchSchema = z.object({
  type: z.literal("launch-snapshot-worker"),
  time_limit_ms: z.number().int().positive(),
  job: snapshotWorkerJobSchema,
});

export type SnapshotWorkerLaunchRequest = z.output<typeof snapshotWorkerLaunchSchema>;

export const announcedKeyVersionSchema = z.number().int().positive();

export const snapshotWorkerMessageSchema = z.discriminatedUnion("type", [
  z.strictObject({
    type: z.literal("snapshot-copy-failed"),
    stage: z.enum(SNAPSHOT_CORRUPTION_STAGES),
  }),
  z.strictObject({
    type: z.literal("snapshot-key-version-announced"),
    version: announcedKeyVersionSchema,
  }),
]);

export type SnapshotWorkerMessage = z.output<typeof snapshotWorkerMessageSchema>;
