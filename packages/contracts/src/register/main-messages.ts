import { SNAPSHOT_CORRUPTION_STAGES } from "@purosur/domain";
import { z } from "zod";
import { requestIdSchema } from "../shared/index.js";
import { installationKeysSchema } from "./installation-keys.js";

const deviceCredentialsSchema = z.object({
  device_id: z.string(),
  device_token: z.string(),
  pepper: z.string(),
  token_received_at: z.string().optional(),
  keys: installationKeysSchema.optional(),
});
export type DeviceCredentials = z.output<typeof deviceCredentialsSchema>;

const credentialsWithAnyKeysSchema = deviceCredentialsSchema.extend({
  keys: z.unknown().optional(),
});

function readableCredentials(value: unknown): DeviceCredentials | undefined {
  const parsed = credentialsWithAnyKeysSchema.safeParse(value);
  if (!parsed.success) {
    return undefined;
  }
  const { keys, ...credentials } = parsed.data;
  const readableKeys = installationKeysSchema.safeParse(keys);
  return readableKeys.success ? { ...credentials, keys: readableKeys.data } : credentials;
}

interface CredentialsReadAnswer {
  type: "device-credentials-read";
  request_id: string;
  credentials?: DeviceCredentials;
}

const credentialsReplacementSchema = z.enum(["replaced", "superseded", "not_stored"]);
export type CredentialsReplacement = z.output<typeof credentialsReplacementSchema>;

export type DeviceCredentialsRequest =
  | { type: "store-device-credentials"; request_id: string; credentials: DeviceCredentials }
  | {
      type: "replace-device-credentials";
      request_id: string;
      expected_device_token: string;
      credentials: DeviceCredentials;
    }
  | { type: "device-credentials-request"; request_id: string }
  | { type: "device-credentials-read-request"; request_id: string }
  | { type: "device-credentials-storable-request"; request_id: string };

const deviceCredentialsAnswerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("device-credentials-stored"),
    request_id: requestIdSchema,
    stored: z.boolean(),
  }),
  z.object({
    type: z.literal("device-credentials-presence"),
    request_id: requestIdSchema,
    present: z.boolean(),
  }),
  z.object({
    type: z.literal("device-credentials-replaced"),
    request_id: requestIdSchema,
    outcome: credentialsReplacementSchema,
  }),
  z
    .object({
      type: z.literal("device-credentials-read"),
      request_id: requestIdSchema,
      credentials: z.unknown().optional(),
    })
    .transform(({ credentials, ...answer }): CredentialsReadAnswer => {
      const readable = readableCredentials(credentials);
      return readable === undefined ? answer : { ...answer, credentials: readable };
    }),
  z.object({
    type: z.literal("device-credentials-storable"),
    request_id: requestIdSchema,
    storable: z.boolean(),
  }),
]);
export type DeviceCredentialsAnswer = z.output<typeof deviceCredentialsAnswerSchema>;

export const mainToCoreMessageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("health-check") }),
  ...deviceCredentialsAnswerSchema.options,
  z.object({ type: z.literal("update-safe-moment-request"), request_id: requestIdSchema }),
  z.object({ type: z.literal("update-hold-release") }),
  z.object({
    type: z.literal("snapshot-worker-exited"),
    copy_failed_stage: z.enum(SNAPSHOT_CORRUPTION_STAGES).optional(),
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

export const coreStatusMessageSchema = z.object({
  type: z.literal("core-status"),
  status: z.enum(["starting", "down", "up", "updating", "refused"]),
});
export type CoreStatusMessage = z.infer<typeof coreStatusMessageSchema>;

export interface CoreStatusRequest {
  channel: "core-status-request";
}
