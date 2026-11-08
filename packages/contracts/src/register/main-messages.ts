import { SNAPSHOT_CORRUPTION_STAGES } from "@purosur/domain";
import { z } from "zod";
import { deviceCredentialsAnswerSchema, requestIdSchema } from "../shared/index.js";
import {
  announcedKeyVersionSchema,
  restoreFirstInstallationSchema,
  snapshotRestoreOutcomeSchema,
} from "./snapshot-worker.js";

export const mainToCoreMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("health-check") }),
  ...deviceCredentialsAnswerSchema.options,
  z.object({ type: z.literal("update-safe-moment-request"), request_id: requestIdSchema }),
  z.object({ type: z.literal("update-hold-release") }),
  z.object({
    type: z.literal("snapshot-worker-exited"),
    copy_failed_stage: z.enum(SNAPSHOT_CORRUPTION_STAGES).optional(),
    latest_announced_key_version: announcedKeyVersionSchema.optional(),
    restore_outcome: snapshotRestoreOutcomeSchema.optional(),
    first_installation: restoreFirstInstallationSchema.optional(),
  }),
]);
export type MainToCoreMessage = z.output<typeof mainToCoreMessageSchema>;

export interface UpdateSafeMomentAnswer {
  type: "update-safe-moment";
  request_id: string;
  safe: boolean;
}

export interface CoreReadyMessage {
  type: "core-ready";
}

export interface QuitRegisterMessage {
  type: "quit-register";
}

export interface CoreRefusedMessage {
  type: "core-refused";
  reason: "newer_database";
}

export type CoreStartupStep =
  | "set_aside_stale_database"
  | "adopt_staged_snapshot"
  | "check_local_database"
  | "apply_migrations"
  | "check_free_disk_space"
  | "settle_interrupted_authorizations";

export interface CoreStartupStepMessage {
  type: "core-startup-step";
  step: CoreStartupStep;
}

export const coreStatusMessageSchema = z.object({
  type: z.literal("core-status"),
  status: z.enum(["starting", "down", "up", "updating", "refused"]),
});
export type CoreStatusMessage = z.infer<typeof coreStatusMessageSchema>;

export interface CoreStatusRequest {
  channel: "core-status-request";
}
