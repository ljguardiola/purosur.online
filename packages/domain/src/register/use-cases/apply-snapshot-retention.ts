import type { Clock } from "../../shared/index.js";
import { DEFAULT_SNAPSHOT_LIFECYCLE_RULES } from "../model/snapshot-lifecycle-rules.js";
import { snapshotGenerationsToPrune } from "../model/snapshot-retention.js";
import type {
  RegisterSnapshotLanes,
  SnapshotObjects,
  SnapshotStore,
} from "./snapshot-generations.js";

export interface ApplySnapshotRetentionPorts {
  store: SnapshotStore;
  lanes: RegisterSnapshotLanes;
  clock: Clock;
  objects: SnapshotObjects;
}

export interface SnapshotRetentionSummary {
  pruned: number;
  objectsDeleted: number;
  objectsPending: number;
}

const NOTHING_RETAINED: SnapshotRetentionSummary = {
  pruned: 0,
  objectsDeleted: 0,
  objectsPending: 0,
};

async function retainRegisterSnapshots(
  store: SnapshotStore,
  { clock, objects }: ApplySnapshotRetentionPorts,
  registerId: string,
): Promise<SnapshotRetentionSummary> {
  const pruned = await store.transaction<number | undefined>(async (tx) => {
    await tx.lockRegisterSnapshots(registerId);
    if (await tx.retentionFrozen(registerId)) {
      return undefined;
    }
    const rules = (await tx.lifecycleRules()) ?? DEFAULT_SNAPSHOT_LIFECYCLE_RULES;
    const generations = (await tx.generationsOf(registerId)).filter(
      (generation) => !generation.pruned,
    );
    const toPrune = snapshotGenerationsToPrune(generations, rules, clock.now(), false);
    if (toPrune.length > 0) {
      await tx.markPruned(toPrune);
    }
    return toPrune.length;
  });
  if (pruned === undefined) {
    return NOTHING_RETAINED;
  }

  const pending = await store.transaction((tx) => tx.prunedWithObject(registerId));
  const summary: SnapshotRetentionSummary = { pruned, objectsDeleted: 0, objectsPending: 0 };
  for (const generation of pending) {
    try {
      await objects.remove(registerId, generation.id);
    } catch {
      summary.objectsPending += 1;
      continue;
    }
    await store.transaction((tx) => tx.markObjectDeleted(generation.id));
    summary.objectsDeleted += 1;
  }
  return summary;
}

export async function applySnapshotRetention(
  ports: ApplySnapshotRetentionPorts,
): Promise<SnapshotRetentionSummary> {
  const summary: SnapshotRetentionSummary = { pruned: 0, objectsDeleted: 0, objectsPending: 0 };
  const registerIds = await ports.store.transaction((tx) => tx.registersWithGenerations());

  for (const registerId of registerIds) {
    const retention = await ports.lanes.inRegisterSnapshotLane(registerId, (store) =>
      retainRegisterSnapshots(store, ports, registerId),
    );
    summary.pruned += retention.pruned;
    summary.objectsDeleted += retention.objectsDeleted;
    summary.objectsPending += retention.objectsPending;
  }
  return summary;
}
