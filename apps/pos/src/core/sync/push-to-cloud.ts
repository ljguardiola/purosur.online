import type { DeviceCredentials } from "@purosur/contracts";
import type { RegisterTelemetry } from "@purosur/domain";
import {
  type AcceptedPushLog,
  type Clock,
  type LocalInstallation,
  type LocalOutbox,
  type PushOutboxOutcome,
  pushOutbox,
} from "@purosur/domain/sync/use-cases";
import { AcceptedPushRecordingInbox } from "./accepted-push-recording-inbox";
import { CloudEventInbox, type PostToCloudWithBearer } from "./cloud-event-inbox";
import { type CloudFailure, retryAfterMsOf } from "./cloud-failure";
import type { SyncResult } from "./sync-schedule";

export interface PushToCloudDeps {
  readCredentials: () => Promise<DeviceCredentials | undefined>;
  outbox: LocalOutbox | undefined;
  installation: LocalInstallation | undefined;
  adoptDevice: (device: { deviceId: string; pepper: string }) => void;
  post: PostToCloudWithBearer | undefined;
  appVersion: string | undefined;
  readTelemetry: (() => Promise<RegisterTelemetry>) | undefined;
  acceptedPush?: { log: AcceptedPushLog; clock: Clock } | undefined;
}

export type PushAttempt =
  | { kind: "not_enrolled" }
  | { kind: "no_cloud" }
  | { kind: "no_local_database" }
  | { kind: "no_app_version" }
  | PushOutboxOutcome<CloudFailure>;

export async function pushToCloud(deps: PushToCloudDeps): Promise<PushAttempt> {
  const { post, outbox, installation, readTelemetry, appVersion } = deps;
  if (post === undefined) {
    return { kind: "no_cloud" };
  }
  if (outbox === undefined || installation === undefined || readTelemetry === undefined) {
    return { kind: "no_local_database" };
  }
  if (appVersion === undefined) {
    return { kind: "no_app_version" };
  }
  const credentials = await deps.readCredentials();
  if (credentials === undefined) {
    return { kind: "not_enrolled" };
  }
  deps.adoptDevice({ deviceId: credentials.device_id, pepper: credentials.pepper });
  const cloudInbox = new CloudEventInbox({
    post,
    deviceToken: credentials.device_token,
    appVersion,
    readTelemetry,
  });
  return pushOutbox({
    outbox,
    installation,
    inbox:
      deps.acceptedPush === undefined
        ? cloudInbox
        : new AcceptedPushRecordingInbox({ inbox: cloudInbox, ...deps.acceptedPush }),
  });
}

export function pushResultOf(attempt: PushAttempt): SyncResult {
  switch (attempt.kind) {
    case "up_to_date":
    case "pushed":
    case "not_enrolled":
    case "no_cloud":
    case "no_local_database":
      return { kind: "succeeded" };
    case "failed": {
      const retryAfterMs = retryAfterMsOf(attempt.failure);
      return retryAfterMs === undefined ? { kind: "failed" } : { kind: "failed", retryAfterMs };
    }
    default:
      return { kind: "failed" };
  }
}

export function pushWarningOf(attempt: PushAttempt): string | undefined {
  switch (attempt.kind) {
    case "revoked":
      return "core: the cloud says this installation was revoked, so its events were not sent";
    case "compromised":
      return "core: the outbox lost events the cloud expects, so this register stopped opening new sales";
    case "failed":
      return attempt.failure.kind === "unreachable"
        ? undefined
        : "core: the push was refused or unreadable, so the outbox will be sent again later";
    case "update_required":
      return "core: the cloud asks this register to update, so the events it does not hold stay in the outbox";
    case "gap":
    case "stale_device":
    case "ack_short_of_batch":
    case "no_app_version":
      return "core: the push stopped before the outbox was acknowledged";
    default:
      return undefined;
  }
}
