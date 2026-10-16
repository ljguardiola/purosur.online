import type { SnapshotsOnDiskBody } from "@purosur/contracts";
import { type CloudClientDeps, putToCloudWithBearer } from "../platform/cloud-client";
import { readGenerations } from "./snapshot-generations-folder";

const ON_DISK_PATH = "/api/devices/current/snapshots/on-disk";

export async function reportGenerationsOnDisk({
  folder,
  deviceToken,
  cloud,
}: {
  folder: string;
  deviceToken: string;
  cloud: CloudClientDeps;
}): Promise<void> {
  const report: SnapshotsOnDiskBody = {
    generation_ids: (await readGenerations(folder)).map((generation) => generation.generationId),
  };
  await putToCloudWithBearer(cloud, ON_DISK_PATH, deviceToken, report);
}
