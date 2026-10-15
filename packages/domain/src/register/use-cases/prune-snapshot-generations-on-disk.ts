import { snapshotDiskPruningPlan } from "../model/snapshot-disk-pruning.js";
import type {
  SnapshotGenerationsOnDisk,
  SnapshotVerificationCloud,
} from "./snapshot-disk-pruning-ports.js";

export interface PruneSnapshotGenerationsOnDiskPorts {
  disk: SnapshotGenerationsOnDisk;
  cloud: SnapshotVerificationCloud;
}

export type PruneSnapshotGenerationsOnDiskOutcome =
  | { kind: "pruned"; removed: string[] }
  | { kind: "verification_unanswered"; removed: string[] };

export async function pruneSnapshotGenerationsOnDisk({
  disk,
  cloud,
}: PruneSnapshotGenerationsOnDiskPorts): Promise<PruneSnapshotGenerationsOnDiskOutcome> {
  const plan = snapshotDiskPruningPlan(await disk.generations(), await disk.space());
  const answer =
    plan.removeIfVerified.length === 0
      ? undefined
      : await cloud.verifiedAmong(plan.removeIfVerified.map((offered) => offered.generationId));
  const verified =
    answer?.kind === "answered"
      ? plan.removeIfVerified.filter((offered) =>
          answer.verifiedGenerationIds.includes(offered.generationId),
        )
      : [];
  const removing = [...plan.remove, ...verified];
  for (const generation of removing) {
    await disk.remove(generation);
  }
  const removed = removing.map((generation) => generation.generationId);
  return answer?.kind === "unanswered"
    ? { kind: "verification_unanswered", removed }
    : { kind: "pruned", removed };
}
