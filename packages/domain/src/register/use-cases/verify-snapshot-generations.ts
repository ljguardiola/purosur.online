import type { Clock } from "../../shared/index.js";
import {
  isAwaitingSnapshotVerification,
  isPastSnapshotUploadDeadline,
} from "../model/snapshot-generation.js";
import type {
  SnapshotGeneration,
  SnapshotObjectContent,
  SnapshotObjects,
  SnapshotSettlement,
  SnapshotStore,
} from "./snapshot-generations.js";

export interface VerifySnapshotGenerationsPorts {
  store: SnapshotStore;
  clock: Clock;
  objects: SnapshotObjects;
}

export interface SnapshotVerificationSummary {
  verified: number;
  failed: number;
  waiting: number;
  unreadable: number;
}

function settlementOf(
  generation: SnapshotGeneration,
  content: SnapshotObjectContent | undefined,
  now: Date,
): SnapshotSettlement | undefined {
  if (!content) {
    return isPastSnapshotUploadDeadline(generation.createdAt, now)
      ? { kind: "failed", reason: "never_uploaded" }
      : undefined;
  }
  if (content.size !== generation.size) {
    return { kind: "failed", reason: "size_mismatch" };
  }
  if (content.sha256 !== generation.sha256) {
    return { kind: "failed", reason: "hash_mismatch" };
  }
  return { kind: "verified" };
}

export async function verifySnapshotGenerations({
  store,
  clock,
  objects,
}: VerifySnapshotGenerationsPorts): Promise<SnapshotVerificationSummary> {
  const unsettled = await store.transaction((tx) => tx.unsettledGenerations());
  const summary: SnapshotVerificationSummary = {
    verified: 0,
    failed: 0,
    waiting: 0,
    unreadable: 0,
  };

  for (const generation of unsettled) {
    let content: SnapshotObjectContent | undefined;
    try {
      content = await objects.inspect(generation.registerId, generation.id);
    } catch {
      summary.unreadable += 1;
      continue;
    }
    const settlement = settlementOf(generation, content, clock.now());
    if (!settlement) {
      summary.waiting += 1;
      continue;
    }
    const settled = await store.transaction(async (tx) => {
      await tx.lockRegisterSnapshots(generation.registerId);
      const current = await tx.findGeneration(generation.registerId, generation.id);
      if (!current || !isAwaitingSnapshotVerification(current.status)) {
        return false;
      }
      await tx.settleGeneration(generation.id, settlement);
      return true;
    });
    if (settled) {
      summary[settlement.kind] += 1;
    }
  }
  return summary;
}
