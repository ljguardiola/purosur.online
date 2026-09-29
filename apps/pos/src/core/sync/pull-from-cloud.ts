import {
  type CatchUpOutcome,
  catchUpWithCloud,
  type LocalReplica,
} from "@purosur/domain/sync/use-cases";
import type { DeviceCredentials } from "../../shared/device-credentials-messages";
import { CloudPullFeed, type GetFromCloud, type PullFailure } from "./cloud-pull-feed";
import type { RegisterPulledChange } from "./pulled-change";

export interface PullFromCloudDeps {
  readCredentials: () => Promise<DeviceCredentials | undefined>;
  replica: LocalReplica<RegisterPulledChange> | undefined;
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
  return catchUpWithCloud({
    replica: deps.replica,
    feed: new CloudPullFeed(deps.getFromCloud, credentials.device_token),
  });
}
