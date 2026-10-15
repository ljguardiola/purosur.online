import {
  countsForSnapshotRestore,
  type SnapshotFailureReason,
  type SnapshotGenerationStatus,
} from "../model/snapshot-generation.js";
import {
  type SnapshotLifecycleRules,
  SNAPSHOT_RECENT_GENERATIONS,
  snapshotLifecycleRulesOrDefault,
} from "../model/snapshot-lifecycle-rules.js";
import { type SnapshotRetentionTier, snapshotRetentionTiers } from "../model/snapshot-retention.js";
import type {
  ListSnapshotBackupRegistersPorts,
  RegisterSnapshotBackupsPorts,
  SnapshotBackupRegister,
} from "./snapshot-backups-read-ports.js";

export interface SnapshotBackupGeneration {
  id: string;
  createdAt: Date;
  size: number;
  status: SnapshotGenerationStatus;
  failureReason: SnapshotFailureReason | null;
  keyVersion: number;
  countsForRestore: boolean;
}

export type RegisterSnapshotBackupsOutcome =
  | { kind: "register_not_found" }
  | {
      kind: "listed";
      rules: SnapshotLifecycleRules;
      tiers: Record<SnapshotRetentionTier, number>;
      recentLimit: number;
      generations: SnapshotBackupGeneration[];
    };

export function listSnapshotBackupRegisters({
  reader,
}: ListSnapshotBackupRegistersPorts): Promise<SnapshotBackupRegister[]> {
  return reader.registersForBackups();
}

export async function registerSnapshotBackups(
  { reader, clock }: RegisterSnapshotBackupsPorts,
  { registerId }: { registerId: string },
): Promise<RegisterSnapshotBackupsOutcome> {
  if (!(await reader.registerExists(registerId))) {
    return { kind: "register_not_found" };
  }
  const rules = snapshotLifecycleRulesOrDefault(await reader.lifecycleRules());
  const unpruned = (await reader.generationsOf(registerId)).filter(
    (generation) => !generation.pruned,
  );
  const kept = snapshotRetentionTiers(unpruned, rules, clock.now());

  return {
    kind: "listed",
    rules,
    tiers: {
      recent: kept.recent.length,
      hourly: kept.hourly.length,
      daily: kept.daily.length,
      monthly: kept.monthly.length,
    },
    recentLimit: SNAPSHOT_RECENT_GENERATIONS,
    generations: unpruned
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .map((generation) => ({
        id: generation.id,
        createdAt: generation.createdAt,
        size: generation.size,
        status: generation.status,
        failureReason: generation.failureReason,
        keyVersion: generation.keyVersion,
        countsForRestore: countsForSnapshotRestore(generation),
      })),
  };
}
