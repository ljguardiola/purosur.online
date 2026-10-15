import { z } from "zod";
import { snapshotKeyVersionSchema } from "./snapshot-upload.js";

export const currentSnapshotKeyVersionAnswerSchema = z.object({
  current_key_version: snapshotKeyVersionSchema,
});

export type CurrentSnapshotKeyVersionAnswer = z.output<
  typeof currentSnapshotKeyVersionAnswerSchema
>;
