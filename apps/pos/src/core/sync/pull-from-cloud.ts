import {
  type CatchUpOutcome,
  catchUpWithCloud,
  type LocalReplica,
} from "@purosur/domain/sync/use-cases";
import type { DeviceCredentials } from "../../shared/device-credentials-messages";
import { type CloudFailure, retryAfterMsOf } from "./cloud-failure";
import { CloudPullFeed, type GetFromCloud } from "./cloud-pull-feed";
import type { RegisterPulledChange } from "./pulled-change";
import type { SyncResult } from "./sync-schedule";

interface RegisterReplica extends LocalReplica<RegisterPulledChange> {
  adoptDevice(device: { deviceId: string; pepper: string }): void;
}

export interface PullFromCloudDeps {
  readCredentials: () => Promise<DeviceCredentials | undefined>;
  replica: RegisterReplica | undefined;
  getFromCloud: GetFromCloud | undefined;
}

export type PullAttempt =
  | { kind: "not_enrolled" }
  | { kind: "no_cloud" }
  | { kind: "no_local_database" }
  | CatchUpOutcome<CloudFailure>;

export async function pullFromCloud(deps: PullFromCloudDeps): Promise<PullAttempt> {
  if (deps.getFromCloud === undefined) {
    return { kind: "no_cloud" };
  }
  if (deps.replica === undefined) {
    return { kind: "no_local_database" };
  }
  const credentials = await deps.readCredentials();
  if (credentials === undefined) {
    return { kind: "not_enrolled" };
  }
  deps.replica.adoptDevice({ deviceId: credentials.device_id, pepper: credentials.pepper });
  return catchUpWithCloud({
    replica: deps.replica,
    feed: new CloudPullFeed(deps.getFromCloud, credentials.device_token),
  });
}

export function pullResultOf(attempt: PullAttempt): SyncResult {
  if (attempt.kind === "page_out_of_order") {
    return { kind: "failed" };
  }
  if (attempt.kind !== "failed") {
    return { kind: "succeeded" };
  }
  const retryAfterMs = retryAfterMsOf(attempt.failure);
  return retryAfterMs === undefined ? { kind: "failed" } : { kind: "failed", retryAfterMs };
}
