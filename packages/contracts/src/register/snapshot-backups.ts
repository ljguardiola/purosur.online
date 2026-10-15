import {
  ARGENTINA_TIME_ZONE,
  SNAPSHOT_FAILURE_REASONS,
  SNAPSHOT_GENERATION_STATUSES,
  SNAPSHOT_LIFECYCLE_LIMITS,
} from "@purosur/domain";
import { z } from "zod";
import { recordIdSchema } from "../shared/index.js";
import { snapshotKeyVersionSchema, snapshotSizeSchema } from "./snapshot-upload.js";

export const snapshotBackupRegistersSchema = z.object({
  registers: z.array(z.object({ id: z.string(), name: z.string() })),
});

export type SnapshotBackupRegisters = z.output<typeof snapshotBackupRegistersSchema>;

function limitedCount({ min, max }: { min: number; max: number }) {
  return z.number().int().min(min).max(max);
}

export const snapshotLifecycleRulesSchema = z.strictObject({
  hourly: limitedCount(SNAPSHOT_LIFECYCLE_LIMITS.hourly),
  daily: limitedCount(SNAPSHOT_LIFECYCLE_LIMITS.daily),
  monthly: limitedCount(SNAPSHOT_LIFECYCLE_LIMITS.monthly),
});

export type SnapshotLifecycleRulesBody = z.output<typeof snapshotLifecycleRulesSchema>;

const tierCountSchema = z.number().int().nonnegative();

const snapshotBackupGenerationSchema = z.object({
  id: recordIdSchema(),
  created_at: z.iso.datetime().meta({ timeZone: ARGENTINA_TIME_ZONE }),
  size: snapshotSizeSchema,
  status: z.enum(SNAPSHOT_GENERATION_STATUSES),
  failure_reason: z.enum(SNAPSHOT_FAILURE_REASONS).nullable(),
  key_version: snapshotKeyVersionSchema,
  counts_for_restore: z.boolean(),
});

export const snapshotBackupsSchema = z.object({
  rules: snapshotLifecycleRulesSchema,
  tiers: z.object({
    recent: tierCountSchema,
    hourly: tierCountSchema,
    daily: tierCountSchema,
    monthly: tierCountSchema,
  }),
  recent_limit: z.number().int().positive(),
  generations: z.array(snapshotBackupGenerationSchema),
});

export type SnapshotBackups = z.output<typeof snapshotBackupsSchema>;

export const snapshotKeyRotationSchema = z.object({
  key_version: snapshotKeyVersionSchema,
});

export type SnapshotKeyRotation = z.output<typeof snapshotKeyRotationSchema>;
