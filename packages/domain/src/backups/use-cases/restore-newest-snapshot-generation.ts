import type { SnapshotRestoreFailureStage } from "../model/snapshot-restore-failure.js";
import type { RestoreNewestSnapshotGenerationPorts } from "./snapshot-restoration-ports.js";

export interface FailedSnapshotGeneration {
  generationId: string;
  stage: SnapshotRestoreFailureStage;
}

export type RestoreNewestSnapshotGenerationOutcome =
  | { kind: "restored"; generationId: string; failures: FailedSnapshotGeneration[] }
  | { kind: "no_generation" }
  | { kind: "none_usable"; failures: FailedSnapshotGeneration[] }
  | { kind: "unreachable" };

export async function restoreNewestSnapshotGeneration({
  generations,
  staging,
}: RestoreNewestSnapshotGenerationPorts): Promise<RestoreNewestSnapshotGenerationOutcome> {
  const listing = await generations.list();
  if (listing.kind === "unreachable") {
    return { kind: "unreachable" };
  }
  if (listing.generations.length === 0) {
    return { kind: "no_generation" };
  }

  const failures: FailedSnapshotGeneration[] = [];
  const newestFirst = [...listing.generations].sort(
    (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
  );
  for (const generation of newestFirst) {
    const answer = await staging.stage(generation);
    if (answer.kind === "staged") {
      return { kind: "restored", generationId: generation.generationId, failures };
    }
    failures.push({ generationId: generation.generationId, stage: answer.stage });
  }
  return { kind: "none_usable", failures };
}
