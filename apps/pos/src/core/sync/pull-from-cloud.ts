import type { DeviceCredentials } from "@purosur/contracts";
import {
  type CatchUpOutcome,
  catchUpWithCloud,
  type LocalReplica,
  type PulledEntity,
  type RedeliveryReplica,
  redeliverPulledEntities,
} from "@purosur/domain/sync/use-cases";
import { type CloudFailure, retryAfterMsOf } from "./cloud-failure";
import { CloudPullFeed, type GetFromCloud } from "./cloud-pull-feed";
import type { RegisterPulledChange } from "./pulled-change";
import type { SyncResult } from "./sync-schedule";

interface RegisterReplica
  extends LocalReplica<RegisterPulledChange>,
    RedeliveryReplica<RegisterPulledChange> {
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
  | CatchUpOutcome<CloudFailure>
  | { kind: "redelivery_failed"; entity: PulledEntity; failure: CloudFailure; cursor: number }
  | { kind: "redelivery_page_out_of_order"; entity: PulledEntity; cursor: number };

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
  const feed = new CloudPullFeed(deps.getFromCloud, credentials.device_token);
  const caughtUp = await catchUpWithCloud({ replica: deps.replica, feed });
  if (caughtUp.kind !== "caught_up") {
    return caughtUp;
  }
  const redelivery = await redeliverPulledEntities({ replica: deps.replica, feed });
  switch (redelivery.kind) {
    case "redelivered":
      return caughtUp;
    case "failed":
      return { ...redelivery, kind: "redelivery_failed" };
    case "page_out_of_order":
      return { ...redelivery, kind: "redelivery_page_out_of_order" };
  }
}

export function pullWarningOf(attempt: PullAttempt): string | undefined {
  switch (attempt.kind) {
    case "page_out_of_order":
      return "core: the pull stopped before catching up";
    case "failed":
      return attempt.failure.kind === "unreachable"
        ? undefined
        : "core: the pull stopped before catching up";
    case "redelivery_page_out_of_order":
      return "core: the pull stopped before redelivering the tables a migration declared";
    case "redelivery_failed":
      return attempt.failure.kind === "unreachable"
        ? undefined
        : "core: the pull stopped before redelivering the tables a migration declared";
    default:
      return undefined;
  }
}

export function pullResultOf(attempt: PullAttempt): SyncResult {
  if (attempt.kind === "page_out_of_order" || attempt.kind === "redelivery_page_out_of_order") {
    return { kind: "failed" };
  }
  if (attempt.kind !== "failed" && attempt.kind !== "redelivery_failed") {
    return { kind: "succeeded" };
  }
  const retryAfterMs = retryAfterMsOf(attempt.failure);
  return retryAfterMs === undefined ? { kind: "failed" } : { kind: "failed", retryAfterMs };
}
