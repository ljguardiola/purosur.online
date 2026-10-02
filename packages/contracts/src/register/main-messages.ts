import { z } from "zod";
import { requestIdSchema } from "../shared/index.js";

const heldVersionedKeySchema = z.object({ version: z.number(), key: z.string() });

const heldInstallationKeysSchema = z.object({
  snapshot_key_versions: z.array(heldVersionedKeySchema),
  contingency_ticket_key: heldVersionedKeySchema,
  outbox_chain_key: z.string(),
});

const deviceCredentialsSchema = z.object({
  device_id: z.string(),
  device_token: z.string(),
  pepper: z.string(),
  token_received_at: z.string().optional(),
  keys: heldInstallationKeysSchema.optional(),
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
  const readableKeys = heldInstallationKeysSchema.safeParse(keys);
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
]);
export type MainToCoreMessage = z.output<typeof mainToCoreMessageSchema>;

export interface CoreReadyMessage {
  type: "core-ready";
}

export const coreStatusMessageSchema = z.object({
  type: z.literal("core-status"),
  status: z.enum(["starting", "down", "up"]),
});
export type CoreStatusMessage = z.infer<typeof coreStatusMessageSchema>;

export interface CoreStatusRequest {
  channel: "core-status-request";
}
