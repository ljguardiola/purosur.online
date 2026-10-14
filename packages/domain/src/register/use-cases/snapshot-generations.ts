import type {
  SnapshotCorruptionStage,
  SnapshotFailureReason,
  SnapshotGenerationStatus,
} from "../model/snapshot-generation.js";
import type { SnapshotLifecycleRules } from "../model/snapshot-lifecycle-rules.js";

export interface NewSnapshotGeneration {
  id: string;
  registerId: string;
  deviceId: string;
  createdAt: Date;
  size: number;
  sha256: string;
  keyVersion: number;
}

export interface SnapshotGeneration extends NewSnapshotGeneration {
  status: SnapshotGenerationStatus;
  failureReason: SnapshotFailureReason | null;
  uploadReportedAt: Date | null;
  pruned: boolean;
  objectDeleted: boolean;
}

export type SnapshotSettlement =
  | { kind: "verified" }
  | { kind: "failed"; reason: SnapshotFailureReason };

export interface SnapshotObjectContent {
  size: number;
  sha256: string;
}

export interface SnapshotObjects {
  inspect(registerId: string, generationId: string): Promise<SnapshotObjectContent | undefined>;
  remove(registerId: string, generationId: string): Promise<void>;
}

export interface SnapshotStore {
  transaction<TOutcome>(
    work: (tx: SnapshotStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface RegisterSnapshotLanes {
  inRegisterSnapshotLane<TOutcome>(
    registerId: string,
    work: (store: SnapshotStore) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export class SnapshotGenerationIdTaken extends Error {}

export interface SnapshotStoreTransaction {
  lockRegisterSnapshots(registerId: string): Promise<void>;
  snapshotKeyVersions(registerId: string): Promise<number[]>;
  findGeneration(registerId: string, generationId: string): Promise<SnapshotGeneration | undefined>;
  recordDeclaredGeneration(generation: NewSnapshotGeneration): Promise<void>;
  recordUploadReported(generationId: string, reportedAt: Date): Promise<void>;
  unsettledGenerations(): Promise<SnapshotGeneration[]>;
  settleGeneration(generationId: string, settlement: SnapshotSettlement): Promise<void>;
  freezeRetention(
    registerId: string,
    stage: SnapshotCorruptionStage,
    frozenAt: Date,
  ): Promise<void>;
  retentionFrozen(registerId: string): Promise<boolean>;
  lifecycleRules(): Promise<SnapshotLifecycleRules | undefined>;
  registersWithGenerations(): Promise<string[]>;
  generationsOf(registerId: string): Promise<SnapshotGeneration[]>;
  markPruned(generationIds: readonly string[]): Promise<void>;
  prunedWithObject(registerId: string): Promise<SnapshotGeneration[]>;
  markObjectDeleted(generationId: string): Promise<void>;
}
