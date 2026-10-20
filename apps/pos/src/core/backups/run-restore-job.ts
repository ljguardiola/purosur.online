import type { SnapshotWorkerJobMessage } from "@purosur/contracts";
import {
  type RestoreNewestSnapshotGenerationOutcome,
  restoreNewestSnapshotGeneration,
} from "@purosur/domain/backups/use-cases";
import type { CloudClientDeps } from "../platform/cloud-client";
import type { Durability } from "../register/durable-files";
import { snapshotKeyBytes } from "../register/snapshot-encryption";
import { createCloudRestorableGenerations } from "./cloud-restorable-generations";
import { createFileSnapshotStaging } from "./file-snapshot-staging";

type RestoreJob = Extract<SnapshotWorkerJobMessage, { kind: "restore" }>;

export function runRestoreJob(
  job: RestoreJob,
  deps: { cloud: CloudClientDeps; durability?: Durability },
): Promise<RestoreNewestSnapshotGenerationOutcome> {
  const restorable = createCloudRestorableGenerations({
    cloud: deps.cloud,
    deviceToken: job.device_token,
  });
  return restoreNewestSnapshotGeneration({
    generations: restorable.generations,
    staging: createFileSnapshotStaging({
      fetch: deps.cloud.fetch,
      downloadUrlOf: restorable.downloadUrlOf,
      keys: job.snapshot_keys.map(({ version, key }) => ({ version, key: snapshotKeyBytes(key) })),
      stagedPath: job.staged_database_path,
      ...(deps.durability === undefined ? {} : { durability: deps.durability }),
    }),
  });
}
