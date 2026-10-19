import type { DeviceCredentials, SnapshotWorkerLaunchRequest } from "@purosur/contracts";
import { SNAPSHOT_WORKER_TIME_LIMIT_MS } from "@purosur/domain";

export interface RestoreLaunchDeps {
  readCredentials: () => Promise<DeviceCredentials | undefined>;
  cloudUrl: string | undefined;
  stagedDatabasePath: string;
  postToMain: (message: SnapshotWorkerLaunchRequest) => void;
}

export function createRestoreLaunch(deps: RestoreLaunchDeps): () => Promise<boolean> {
  return async () => {
    const credentials = await deps.readCredentials();
    const keys = credentials?.keys?.snapshot_key_versions;
    if (credentials === undefined || keys === undefined || deps.cloudUrl === undefined) {
      return false;
    }
    deps.postToMain({
      type: "launch-snapshot-worker",
      time_limit_ms: SNAPSHOT_WORKER_TIME_LIMIT_MS,
      job: {
        kind: "restore",
        device_token: credentials.device_token,
        cloud_url: deps.cloudUrl,
        staged_database_path: deps.stagedDatabasePath,
        snapshot_keys: keys,
      },
    });
    return true;
  };
}
