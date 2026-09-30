import { deviceTokenRotationSchema } from "@purosur/contracts";
import { isDeviceTokenRotationDue } from "@purosur/domain";
import type {
  CredentialsReplacement,
  DeviceCredentials,
} from "../../shared/device-credentials-messages";
import type { CloudResponse } from "../platform/cloud-client";
import { installationKeysFrom } from "./installation-keys";

export interface DeviceTokenRotationDeps {
  readCredentials: () => Promise<DeviceCredentials | undefined>;
  postToCloud: (path: string, bearerToken: string) => Promise<CloudResponse>;
  replaceCredentials: (
    expectedDeviceToken: string,
    credentials: DeviceCredentials,
  ) => Promise<CredentialsReplacement>;
  now: () => Date;
}

type DeviceTokenRotationOutcome =
  | { kind: "rotated" }
  | { kind: "not_due" }
  | { kind: "not_enrolled" }
  | { kind: "rejected" }
  | { kind: "unreachable" }
  | { kind: "unavailable" }
  | { kind: "superseded" }
  | { kind: "not_stored" };

function isDue(credentials: DeviceCredentials, now: Date): boolean {
  if (credentials.token_received_at === undefined || credentials.keys === undefined) {
    return true;
  }
  const receivedAt = new Date(credentials.token_received_at);
  return Number.isNaN(receivedAt.getTime()) || isDeviceTokenRotationDue(receivedAt, now);
}

export async function rotateDeviceToken(
  deps: DeviceTokenRotationDeps,
): Promise<DeviceTokenRotationOutcome> {
  const credentials = await deps.readCredentials();
  if (credentials === undefined) {
    return { kind: "not_enrolled" };
  }
  if (!isDue(credentials, deps.now())) {
    return { kind: "not_due" };
  }

  const response = await deps.postToCloud("/api/devices/rotate-token", credentials.device_token);
  if (response.kind === "unreachable") {
    return { kind: "unreachable" };
  }
  if (response.kind === "error") {
    return response.error.code === "device_token_rejected"
      ? { kind: "rejected" }
      : { kind: "unavailable" };
  }
  const rotation = deviceTokenRotationSchema.safeParse(response.body);
  if (!rotation.success) {
    return { kind: "unavailable" };
  }

  const replacement = await deps.replaceCredentials(credentials.device_token, {
    device_id: credentials.device_id,
    pepper: credentials.pepper,
    device_token: rotation.data.device_token,
    token_received_at: deps.now().toISOString(),
    keys: installationKeysFrom(rotation.data),
  });
  return replacement === "replaced" ? { kind: "rotated" } : { kind: replacement };
}
