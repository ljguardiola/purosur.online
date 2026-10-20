import type { SnapshotRestoreFailureStage } from "../model/snapshot-restore-failure.js";

export interface RestorableGeneration {
  generationId: string;
  registerId: string;
  createdAt: Date;
  size: number;
  sha256: string;
  keyVersion: number;
}

export type RestorableGenerationsAnswer =
  | { kind: "listed"; generations: readonly RestorableGeneration[] }
  | { kind: "unreachable" };

// Only generations the cloud verified and has not pruned, in no particular order.
export interface RestorableGenerations {
  list(): Promise<RestorableGenerationsAnswer>;
}

export type SnapshotStagingAnswer =
  | { kind: "staged" }
  | { kind: "failed"; stage: SnapshotRestoreFailureStage };

// Downloads, checks, decrypts and stages the generation for adoption, or says at which stage it failed.
export interface SnapshotStaging {
  stage(generation: RestorableGeneration): Promise<SnapshotStagingAnswer>;
}

export interface RestoreNewestSnapshotGenerationPorts {
  generations: RestorableGenerations;
  staging: SnapshotStaging;
}
