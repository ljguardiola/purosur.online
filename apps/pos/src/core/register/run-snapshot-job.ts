import { mkdir, rename, rm } from "node:fs/promises";
import type { SnapshotWorkerJobMessage } from "@purosur/contracts";
import type { SnapshotCorruptionStage } from "@purosur/domain";
import type { CloudClientDeps } from "../platform/cloud-client";
import { type Durability, nodeDurability } from "./durable-files";
import { copyAndCheck, SnapshotCopyFailed } from "./snapshot-copy";
import {
  encryptSnapshotFile,
  snapshotAssociatedData,
  snapshotKeyBytes,
} from "./snapshot-encryption";
import {
  objectPath,
  removeLeftovers,
  temporaryCopyPath,
  temporaryObjectPath,
  writeManifest,
} from "./snapshot-generations-folder";
import { type UploadSummary, uploadPendingGenerations } from "./snapshot-upload";

type TakeJob = Extract<SnapshotWorkerJobMessage, { kind: "take" }>;

export interface SnapshotJobDeps {
  cloud: CloudClientDeps;
  now: () => Date;
  durability?: Durability;
}

export type SnapshotJobResult =
  | { kind: "completed"; uploads: UploadSummary }
  | { kind: "aborted"; stage: SnapshotCorruptionStage };

async function takeSnapshot(
  job: TakeJob,
  { now, durability = nodeDurability }: SnapshotJobDeps,
): Promise<void> {
  const folder = job.snapshots_folder;
  const copyPath = temporaryCopyPath(folder, job.generation_id);
  const encryptedPath = temporaryObjectPath(folder, job.generation_id);
  try {
    await copyAndCheck({ databasePath: job.database_path, copyPath, durability });
    const { size, sha256 } = await encryptSnapshotFile({
      sourcePath: copyPath,
      targetPath: encryptedPath,
      key: snapshotKeyBytes(job.key.key),
      associatedData: snapshotAssociatedData({
        registerId: job.register_id,
        keyVersion: job.key.version,
        generationId: job.generation_id,
      }),
    });
    await durability.file(encryptedPath);
    await rename(encryptedPath, objectPath(folder, job.generation_id));
    await durability.folder(folder);
    await rm(copyPath);
    await writeManifest(
      folder,
      {
        generation_id: job.generation_id,
        created_at: now().toISOString(),
        last_device_seq: job.last_device_seq,
        pull_cursor: job.pull_cursor,
        key_version: job.key.version,
        size,
        sha256,
        uploaded_at: null,
        refused_at: null,
      },
      durability,
    );
  } catch (error) {
    await rm(copyPath, { force: true });
    await rm(encryptedPath, { force: true });
    throw error;
  }
}

export async function runSnapshotJob(
  job: SnapshotWorkerJobMessage,
  deps: SnapshotJobDeps,
): Promise<SnapshotJobResult> {
  await mkdir(job.snapshots_folder, { recursive: true });
  await removeLeftovers(job.snapshots_folder);
  if (job.kind === "take") {
    try {
      await takeSnapshot(job, deps);
    } catch (error) {
      if (error instanceof SnapshotCopyFailed) {
        return { kind: "aborted", stage: error.stage };
      }
      throw error;
    }
  }
  const uploads = await uploadPendingGenerations({
    folder: job.snapshots_folder,
    deviceToken: job.device_token,
    cloud: deps.cloud,
    now: deps.now,
    ...(deps.durability === undefined ? {} : { durability: deps.durability }),
  });
  return { kind: "completed", uploads };
}
