import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";

const SHA256_HEX = /^[0-9a-f]{64}$/;

export const snapshotSizeSchema = z.number().int().positive().safe();
export const snapshotSha256Schema = z.string().regex(SHA256_HEX);
export const snapshotKeyVersionSchema = z.number().int().positive().safe();

export const snapshotUploadBodySchema = z.strictObject({
  generation_id: recordIdSchema(),
  size: snapshotSizeSchema,
  sha256: snapshotSha256Schema,
  key_version: snapshotKeyVersionSchema,
});

export type SnapshotUploadBody = z.output<typeof snapshotUploadBodySchema>;

export const snapshotUploadAnswerSchema = z.object({
  upload_url: z.url({ protocol: /^https$/ }),
  required_headers: z.record(z.string(), z.string()),
  expires_at: z.iso.datetime(),
});

export type SnapshotUploadAnswer = z.output<typeof snapshotUploadAnswerSchema>;
