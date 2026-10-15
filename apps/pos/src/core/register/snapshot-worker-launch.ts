import type { DeviceCredentials, SnapshotWorkerLaunchRequest } from "@purosur/contracts";
import { latestKey, SNAPSHOT_WORKER_TIME_LIMIT_MS } from "@purosur/domain";
import type { SnapshotWorkerLauncher } from "@purosur/domain/register/use-cases";

export interface SnapshotWorkerLaunchDeps {
  readCredentials: () => Promise<DeviceCredentials | undefined>;
  readRegisterId: () => string | undefined;
  cloudUrl: string | undefined;
  databasePath: string;
  snapshotsFolder: string;
  postToMain: (message: SnapshotWorkerLaunchRequest) => void;
}

export function createSnapshotWorkerLaunch(deps: SnapshotWorkerLaunchDeps): SnapshotWorkerLauncher {
  return {
    async launch(job) {
      const credentials = await deps.readCredentials();
      if (credentials === undefined || deps.cloudUrl === undefined) {
        return false;
      }
      const common = {
        device_token: credentials.device_token,
        cloud_url: deps.cloudUrl,
        snapshots_folder: deps.snapshotsFolder,
      };
      if (job.kind === "upload_pending") {
        deps.postToMain({
          type: "launch-snapshot-worker",
          time_limit_ms: SNAPSHOT_WORKER_TIME_LIMIT_MS,
          job: { kind: "upload_pending", ...common },
        });
        return true;
      }
      const key = latestKey(credentials.keys?.snapshot_key_versions ?? []);
      const registerId = deps.readRegisterId();
      if (key === undefined || registerId === undefined) {
        return false;
      }
      deps.postToMain({
        type: "launch-snapshot-worker",
        time_limit_ms: SNAPSHOT_WORKER_TIME_LIMIT_MS,
        job: {
          kind: "take",
          register_id: registerId,
          generation_id: job.generationId,
          key,
          database_path: deps.databasePath,
          last_device_seq: job.sequences.lastDeviceSeq,
          pull_cursor: job.sequences.pullCursor,
          ...common,
        },
      });
      return true;
    },
  };
}
