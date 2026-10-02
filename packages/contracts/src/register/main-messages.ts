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
  z.object({
    type: z.literal("device-credentials-read"),
    request_id: requestIdSchema,
    credentials: deviceCredentialsSchema.optional(),
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
]);
export type MainToCoreMessage = z.output<typeof mainToCoreMessageSchema>;

export interface CoreReadyMessage {
  type: "core-ready";
}

export type CoreToMainMessage = CoreReadyMessage | DeviceCredentialsRequest;

export const coreStatusMessageSchema = z.object({
  type: z.literal("core-status"),
  status: z.enum(["starting", "down", "up"]),
});
export type CoreStatusMessage = z.infer<typeof coreStatusMessageSchema>;

export interface CoreStatusRequest {
  channel: "core-status-request";
}
