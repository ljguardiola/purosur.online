import {
  type DeviceCredentials,
  SNAPSHOT_VERIFICATION_QUERY_LIMIT,
  snapshotVerificationAnswerSchema,
} from "@purosur/contracts";
import {
  type PruneSnapshotGenerationsOnDiskOutcome,
  pruneSnapshotGenerationsOnDisk,
  type SnapshotGenerationsOnDisk,
  type SnapshotVerificationCloud,
} from "@purosur/domain/register/use-cases";
import { type CloudClientDeps, getFromCloud } from "../platform/cloud-client";
import type { StorageReading } from "../sync/storage-telemetry";
import { type Durability, nodeDurability } from "./durable-files";
import { readGenerations, removeGeneration } from "./snapshot-generations-folder";

const VERIFICATION_PATH = "/api/devices/current/snapshots/verified";

export function folderSnapshotGenerationsOnDisk(
  folder: string,
  readStorage: () => Promise<StorageReading>,
  durability: Durability = nodeDurability,
): SnapshotGenerationsOnDisk {
  return {
    space: async () => {
      const reading = await readStorage();
      return { diskFreeBytes: reading.disk_free_bytes, diskFreeRatio: reading.disk_free_ratio };
    },
    generations: () => readGenerations(folder),
    remove: (generation) => removeGeneration(folder, generation.generationId, durability),
  };
}

function inParts(ids: readonly string[]): string[][] {
  const parts: string[][] = [];
  for (let start = 0; start < ids.length; start += SNAPSHOT_VERIFICATION_QUERY_LIMIT) {
    parts.push(ids.slice(start, start + SNAPSHOT_VERIFICATION_QUERY_LIMIT));
  }
  return parts;
}

export function cloudSnapshotVerification(
  cloud: CloudClientDeps,
  deviceToken: string,
): SnapshotVerificationCloud {
  return {
    async verifiedAmong(generationIds) {
      const verified: string[] = [];
      for (const part of inParts(generationIds)) {
        const query = new URLSearchParams(part.map((id) => ["generation_id", id]));
        const answered = await getFromCloud(cloud, `${VERIFICATION_PATH}?${query}`, {
          authorization: `Bearer ${deviceToken}`,
        });
        if (answered.kind !== "ok") {
          return { kind: "unanswered" };
        }
        const answer = snapshotVerificationAnswerSchema.safeParse(answered.body);
        if (!answer.success) {
          return { kind: "unanswered" };
        }
        verified.push(...answer.data.verified_generation_ids);
      }
      return { kind: "answered", verifiedGenerationIds: verified };
    },
  };
}

const UNANSWERING_CLOUD: SnapshotVerificationCloud = {
  verifiedAmong: async () => ({ kind: "unanswered" }),
};

export interface SnapshotDiskPruningDeps {
  snapshotsFolder: string;
  readStorage: () => Promise<StorageReading>;
  readCredentials: () => Promise<DeviceCredentials | undefined>;
  cloud: CloudClientDeps | undefined;
  durability?: Durability;
}

export async function pruneSnapshotsOnDisk(
  deps: SnapshotDiskPruningDeps,
): Promise<PruneSnapshotGenerationsOnDiskOutcome> {
  const credentials = await deps.readCredentials();
  return pruneSnapshotGenerationsOnDisk({
    disk: folderSnapshotGenerationsOnDisk(deps.snapshotsFolder, deps.readStorage, deps.durability),
    cloud:
      credentials === undefined || deps.cloud === undefined
        ? UNANSWERING_CLOUD
        : cloudSnapshotVerification(deps.cloud, credentials.device_token),
  });
}
