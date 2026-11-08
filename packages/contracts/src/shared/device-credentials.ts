import { z } from "zod";
import { installationKeysSchema } from "./installation-keys.js";
import { requestIdSchema } from "./request-id.js";

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

export interface CredentialsReadAnswer {
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
  | { type: "device-credentials-read-request"; request_id: string }
  | { type: "device-credentials-storable-request"; request_id: string };

export const deviceCredentialsAnswerSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("device-credentials-stored"),
    request_id: requestIdSchema,
    stored: z.boolean(),
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
