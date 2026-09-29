// Main keeps the device credentials but may not depend on packages/contracts, so the messages it
// exchanges with the core about them are read here, with no library, like the core's ready message.

export interface DeviceCredentials {
  device_id: string;
  device_token: string;
  pepper: string;
  token_received_at?: string;
}

export type DeviceCredentialsRequest =
  | { type: "store-device-credentials"; request_id: string; credentials: DeviceCredentials }
  | { type: "device-credentials-request"; request_id: string }
  | { type: "device-credentials-read-request"; request_id: string }
  | { type: "device-credentials-storable-request"; request_id: string };

export type DeviceCredentialsAnswer =
  | { type: "device-credentials-stored"; request_id: string; stored: boolean }
  | { type: "device-credentials-presence"; request_id: string; present: boolean }
  | { type: "device-credentials-read"; request_id: string; credentials?: DeviceCredentials }
  | { type: "device-credentials-storable"; request_id: string; storable: boolean };

type Fields = Record<string, unknown>;

function fieldsOf(value: unknown): Fields | undefined {
  return typeof value === "object" && value !== null ? (value as Fields) : undefined;
}

export function readDeviceCredentials(value: unknown): DeviceCredentials | undefined {
  const fields = fieldsOf(value);
  const { device_id, device_token, pepper, token_received_at } = fields ?? {};
  if (
    typeof device_id !== "string" ||
    typeof device_token !== "string" ||
    typeof pepper !== "string"
  ) {
    return undefined;
  }
  if (token_received_at === undefined) {
    return { device_id, device_token, pepper };
  }
  return typeof token_received_at === "string"
    ? { device_id, device_token, pepper, token_received_at }
    : undefined;
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
