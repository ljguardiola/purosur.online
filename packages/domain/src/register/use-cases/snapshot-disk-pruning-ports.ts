import type { LocalSnapshotGeneration } from "../model/local-snapshot-generation.js";
import type { SnapshotDiskSpace } from "../model/snapshot-disk-pruning.js";

export interface SnapshotGenerationsOnDisk {
  space(): Promise<SnapshotDiskSpace>;
  generations(): Promise<LocalSnapshotGeneration[]>;
  remove(generation: LocalSnapshotGeneration): Promise<void>;
}

export type SnapshotVerificationAnswer =
  | { kind: "answered"; verifiedGenerationIds: string[] }
  | { kind: "unanswered" };

export interface SnapshotVerificationCloud {
  verifiedAmong(generationIds: readonly string[]): Promise<SnapshotVerificationAnswer>;
}
