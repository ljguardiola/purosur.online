import {
  type CatchUpOutcome,
  catchUpWithCloud,
  type LocalReplica,
} from "@purosur/domain/sync/use-cases";
import type { DeviceCredentials } from "../../shared/device-credentials-messages";
import { CloudPullFeed, type GetFromCloud, type PullFailure } from "./cloud-pull-feed";
import type { PullResult } from "./pull-schedule";
import type { RegisterPulledChange } from "./pulled-change";

interface RegisterReplica extends LocalReplica<RegisterPulledChange> {
  adoptDevice(deviceId: string): void;
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
  | CatchUpOutcome<PullFailure>;

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
  deps.replica.adoptDevice(credentials.device_id);
  return catchUpWithCloud({
    replica: deps.replica,
    feed: new CloudPullFeed(deps.getFromCloud, credentials.device_token),
  });
}

export function pullResultOf(attempt: PullAttempt): PullResult {
  if (attempt.kind === "page_out_of_order") {
    return { kind: "failed" };
  }
  if (attempt.kind !== "failed") {
    return { kind: "succeeded" };
  }
  if (attempt.failure.kind === "refused" && attempt.failure.retryAfterSeconds !== undefined) {
    return { kind: "failed", retryAfterMs: attempt.failure.retryAfterSeconds * 1000 };
  }
  return { kind: "failed" };
}
