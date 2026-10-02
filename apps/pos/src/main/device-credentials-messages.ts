import type { DeviceCredentials, DeviceCredentialsRequest } from "@purosur/contracts";

// Main may import only types from packages/contracts, so it reads the core's requests and its own
// credentials file with no library.

type InstallationKeys = NonNullable<DeviceCredentials["keys"]>;

type Fields = Record<string, unknown>;

function fieldsOf(value: unknown): Fields | undefined {
  return typeof value === "object" && value !== null ? (value as Fields) : undefined;
}

function readVersionedKey(value: unknown): InstallationKeys["contingency_ticket_key"] | undefined {
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
  // Unreadable keys are left out rather than the whole credentials, since the token alone gets
  // them handed over again at its next rotation.
  const installationKeys = readInstallationKeys(keys);
  return installationKeys === undefined ? credentials : { ...credentials, keys: installationKeys };
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
