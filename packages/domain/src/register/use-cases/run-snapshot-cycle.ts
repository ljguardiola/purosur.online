import { type SnapshotSkipReason, snapshotCycleDecision } from "../model/snapshot-cycle.js";
import type { IdGenerator } from "./cash-ledger.js";
import type {
  SnapshotCycleState,
  SnapshotWorkerJob,
  SnapshotWorkerLauncher,
} from "./snapshot-cycle-ports.js";

export interface RunSnapshotCyclePorts {
  state: SnapshotCycleState;
  launcher: SnapshotWorkerLauncher;
  ids: IdGenerator;
}

export type RunSnapshotCycleOutcome =
  | { kind: "launched"; job: SnapshotWorkerJob }
  | { kind: "launch_unavailable" }
  | { kind: "skipped"; reason: SnapshotSkipReason };

export async function runSnapshotCycle({
  state,
  launcher,
  ids,
}: RunSnapshotCyclePorts): Promise<RunSnapshotCycleOutcome> {
  const current = await state.currentSequences();
  const decision = snapshotCycleDecision({
    lastGeneration: await state.lastGeneration(),
    current,
    battery: await state.battery(),
    storage: await state.storage(),
    pendingUploads: await state.hasPendingUploads(),
    cloudReachable: await state.cloudReachable(),
  });
  if (decision.kind === "skip") {
    return { kind: "skipped", reason: decision.reason };
  }
  const job: SnapshotWorkerJob =
    decision.kind === "take"
      ? { kind: "take", generationId: ids.next(), sequences: current }
      : { kind: "upload_pending" };
  return (await launcher.launch(job)) ? { kind: "launched", job } : { kind: "launch_unavailable" };
}
