import { join } from "node:path";
import type { DeviceCredentials, SnapshotWorkerLaunchRequest } from "@purosur/contracts";
import { SNAPSHOT_WORKER_TIME_LIMIT_MS } from "@purosur/domain";
import { STAGED_DATABASE_FILE } from "./adopt-restored-snapshot";
import type { RestorePending } from "./restore-pending";

export interface RestoreLaunchDeps {
  pending: RestorePending;
  readCredentials: () => Promise<DeviceCredentials | undefined>;
  cloudUrl: string | undefined;
  dataFolder: string | undefined;
  postToMain: (message: SnapshotWorkerLaunchRequest) => void;
}

export function createRestoreLaunch(deps: RestoreLaunchDeps): () => Promise<boolean> {
  return async () => {
    const credentials = await deps.readCredentials();
    const keys = credentials?.keys?.snapshot_key_versions;
    if (
      credentials === undefined ||
      keys === undefined ||
      deps.cloudUrl === undefined ||
      deps.dataFolder === undefined
    ) {
      return false;
    }
    if (deps.pending.deviceId() === undefined) {
      deps.pending.begin(credentials.device_id);
    }
    deps.postToMain({
      type: "launch-snapshot-worker",
      time_limit_ms: SNAPSHOT_WORKER_TIME_LIMIT_MS,
      job: {
        kind: "restore",
        device_token: credentials.device_token,
        cloud_url: deps.cloudUrl,
        staged_database_path: join(deps.dataFolder, STAGED_DATABASE_FILE),
        snapshot_keys: keys,
      },
    });
    return true;
  };
}
