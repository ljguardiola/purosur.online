// Main keeps the device credentials but may not depend on packages/contracts, so the messages it
// exchanges with the core about them are read here, with no library, like the core's ready message.

interface VersionedInstallationKey {
  version: number;
  key: string;
}

export interface InstallationKeys {
  snapshot_key_versions: VersionedInstallationKey[];
  contingency_ticket_key: VersionedInstallationKey;
  outbox_chain_key: string;
}

export interface DeviceCredentials {
  device_id: string;
  device_token: string;
  pepper: string;
  token_received_at?: string;
  keys?: InstallationKeys;
}

export type CredentialsReplacement = "replaced" | "superseded" | "not_stored";

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

export type DeviceCredentialsAnswer =
  | { type: "device-credentials-stored"; request_id: string; stored: boolean }
  | { type: "device-credentials-presence"; request_id: string; present: boolean }
  | { type: "device-credentials-replaced"; request_id: string; outcome: CredentialsReplacement }
  | { type: "device-credentials-read"; request_id: string; credentials?: DeviceCredentials }
  | { type: "device-credentials-storable"; request_id: string; storable: boolean };

type Fields = Record<string, unknown>;

function fieldsOf(value: unknown): Fields | undefined {
  return typeof value === "object" && value !== null ? (value as Fields) : undefined;
}

function readVersionedKey(value: unknown): VersionedInstallationKey | undefined {
  const { version, key } = fieldsOf(value) ?? {};
  return typeof version === "number" && typeof key === "string" ? { version, key } : undefined;
}

function readInstallationKeys(value: unknown): InstallationKeys | undefined {
  const fields = fieldsOf(value);
  const snapshotKeyVersions = fields?.["snapshot_key_versions"];
  const contingencyTicketKey = readVersionedKey(fields?.["contingency_ticket_key"]);
  const outboxChainKey = fields?.["outbox_chain_key"];
  if (
    !Array.isArray(snapshotKeyVersions) ||
    contingencyTicketKey === undefined ||
    typeof outboxChainKey !== "string"
  ) {
    return undefined;
  }
  const versions = snapshotKeyVersions.map(readVersionedKey);
  return versions.every((version) => version !== undefined)
    ? {
        snapshot_key_versions: versions,
        contingency_ticket_key: contingencyTicketKey,
        outbox_chain_key: outboxChainKey,
      }
    : undefined;
}

export function readDeviceCredentials(value: unknown): DeviceCredentials | undefined {
  const fields = fieldsOf(value);
  const { device_id, device_token, pepper, token_received_at, keys } = fields ?? {};
  if (
    typeof device_id !== "string" ||
    typeof device_token !== "string" ||
    typeof pepper !== "string" ||
    (token_received_at !== undefined && typeof token_received_at !== "string")
  ) {
    return undefined;
  }
  const credentials: DeviceCredentials = { device_id, device_token, pepper };
  if (token_received_at !== undefined) {
    credentials.token_received_at = token_received_at;
  }
  if (keys === undefined) {
    return credentials;
  }
  const installationKeys = readInstallationKeys(keys);
  return installationKeys === undefined ? undefined : { ...credentials, keys: installationKeys };
}

export function readDeviceCredentialsRequest(
  message: unknown,
): DeviceCredentialsRequest | undefined {
  const fields = fieldsOf(message);
  const requestId = fields?.["request_id"];
  if (typeof requestId !== "string") {
    return undefined;
  }
  if (fields?.["type"] === "device-credentials-request") {
    return { type: "device-credentials-request", request_id: requestId };
  }
  if (fields?.["type"] === "device-credentials-read-request") {
    return { type: "device-credentials-read-request", request_id: requestId };
  }
  if (fields?.["type"] === "device-credentials-storable-request") {
    return { type: "device-credentials-storable-request", request_id: requestId };
  }
  const credentials = readDeviceCredentials(fields?.["credentials"]);
  if (fields?.["type"] === "store-device-credentials" && credentials !== undefined) {
    return { type: "store-device-credentials", request_id: requestId, credentials };
  }
  const expectedDeviceToken = fields?.["expected_device_token"];
  if (
    fields?.["type"] === "replace-device-credentials" &&
    credentials !== undefined &&
    typeof expectedDeviceToken === "string"
  ) {
    return {
      type: "replace-device-credentials",
      request_id: requestId,
      expected_device_token: expectedDeviceToken,
      credentials,
    };
  }
  return undefined;
}

export function readDeviceCredentialsAnswer(message: unknown): DeviceCredentialsAnswer | undefined {
  const fields = fieldsOf(message);
  const requestId = fields?.["request_id"];
  if (typeof requestId !== "string") {
    return undefined;
  }
  const stored = fields?.["stored"];
  if (fields?.["type"] === "device-credentials-stored" && typeof stored === "boolean") {
    return { type: "device-credentials-stored", request_id: requestId, stored };
  }
  const present = fields?.["present"];
  if (fields?.["type"] === "device-credentials-presence" && typeof present === "boolean") {
    return { type: "device-credentials-presence", request_id: requestId, present };
  }
  const outcome = fields?.["outcome"];
  if (
    fields?.["type"] === "device-credentials-replaced" &&
    (outcome === "replaced" || outcome === "superseded" || outcome === "not_stored")
  ) {
    return { type: "device-credentials-replaced", request_id: requestId, outcome };
  }
  if (fields?.["type"] === "device-credentials-read") {
    const credentials = readDeviceCredentials(fields["credentials"]);
    return credentials === undefined
      ? { type: "device-credentials-read", request_id: requestId }
      : { type: "device-credentials-read", request_id: requestId, credentials };
  }
  const storable = fields?.["storable"];
  if (fields?.["type"] === "device-credentials-storable" && typeof storable === "boolean") {
    return { type: "device-credentials-storable", request_id: requestId, storable };
  }
  return undefined;
}
