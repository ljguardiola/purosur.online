import { type SnapshotCorruptionStage, snapshotIntervalMs } from "@purosur/domain";
import type { RunSnapshotCycleOutcome } from "@purosur/domain/register/use-cases";

export interface SnapshotCycleScheduleDeps {
  runCycle: () => Promise<RunSnapshotCycleOutcome>;
  cloudReachable: () => boolean;
  scheduleNext: (run: () => Promise<void>, delayMs: number) => void;
  checkpoint: () => void;
  recordCopyFailure: (stage: SnapshotCorruptionStage) => Promise<void>;
  onFailure: (error: unknown) => void;
}

export interface SnapshotCycleSchedule {
  start(): void;
  workerExited(copyFailedStage?: SnapshotCorruptionStage): Promise<void>;
}

export function createSnapshotCycleSchedule(
  deps: SnapshotCycleScheduleDeps,
): SnapshotCycleSchedule {
  let workerInFlight = false;

  function scheduleNext(): void {
    deps.scheduleNext(cycle, snapshotIntervalMs(deps.cloudReachable()));
  }

  async function cycle(): Promise<void> {
    if (!workerInFlight) {
      try {
        workerInFlight = (await deps.runCycle()).kind === "launched";
      } catch (error) {
        deps.onFailure(error);
      }
    }
    scheduleNext();
  }

  return {
    start: scheduleNext,
    async workerExited(copyFailedStage) {
      workerInFlight = false;
      try {
        deps.checkpoint();
      } catch (error) {
        deps.onFailure(error);
      }
      if (copyFailedStage !== undefined) {
        try {
          await deps.recordCopyFailure(copyFailedStage);
        } catch (error) {
          deps.onFailure(error);
        }
      }
    },
  };
}
