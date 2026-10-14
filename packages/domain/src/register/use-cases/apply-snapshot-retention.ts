import type { Clock } from "../../shared/index.js";
import { DEFAULT_SNAPSHOT_LIFECYCLE_RULES } from "../model/snapshot-lifecycle-rules.js";
import { snapshotGenerationsToPrune } from "../model/snapshot-retention.js";
import type { SnapshotObjects, SnapshotStore } from "./snapshot-generations.js";

export interface ApplySnapshotRetentionPorts {
  store: SnapshotStore;
  clock: Clock;
  objects: SnapshotObjects;
}

export interface SnapshotRetentionSummary {
  pruned: number;
  objectsDeleted: number;
  objectsPending: number;
}

type RegisterRetention = { frozen: true } | { frozen: false; pruned: number };

async function deleteObjectsOfPruned(
  { store, objects }: ApplySnapshotRetentionPorts,
  registerId: string,
): Promise<Pick<SnapshotRetentionSummary, "objectsDeleted" | "objectsPending">> {
  const pending = await store.transaction((tx) => tx.prunedWithObject(registerId));
  let objectsDeleted = 0;
  let objectsPending = 0;
  for (const generation of pending) {
    try {
      await objects.remove(registerId, generation.id);
    } catch {
      objectsPending += 1;
      continue;
    }
    await store.transaction((tx) => tx.markObjectDeleted(generation.id));
    objectsDeleted += 1;
  }
  return { objectsDeleted, objectsPending };
}

export async function applySnapshotRetention(
  ports: ApplySnapshotRetentionPorts,
): Promise<SnapshotRetentionSummary> {
  const { store, clock } = ports;
  const summary: SnapshotRetentionSummary = { pruned: 0, objectsDeleted: 0, objectsPending: 0 };
  const registerIds = await store.transaction((tx) => tx.registersWithGenerations());

  for (const registerId of registerIds) {
    const retention = await store.transaction<RegisterRetention>(async (tx) => {
      await tx.lockRegisterSnapshots(registerId);
      if (await tx.retentionFrozen(registerId)) {
        return { frozen: true };
      }
      const rules = (await tx.lifecycleRules()) ?? DEFAULT_SNAPSHOT_LIFECYCLE_RULES;
      const generations = (await tx.generationsOf(registerId)).filter(
        (generation) => !generation.pruned,
      );
      const toPrune = snapshotGenerationsToPrune(generations, rules, clock.now(), false);
      if (toPrune.length > 0) {
        await tx.markPruned(toPrune);
      }
      return { frozen: false, pruned: toPrune.length };
    });
    if (retention.frozen) {
      continue;
    }
    summary.pruned += retention.pruned;
    const deletion = await deleteObjectsOfPruned(ports, registerId);
    summary.objectsDeleted += deletion.objectsDeleted;
    summary.objectsPending += deletion.objectsPending;
  }
  return summary;
}
