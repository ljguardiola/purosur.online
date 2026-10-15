import { snapshotIntervalMs } from "@purosur/domain";
import type { RunSnapshotCycleOutcome } from "@purosur/domain/register/use-cases";

export interface SnapshotCycleScheduleDeps {
  runCycle: () => Promise<RunSnapshotCycleOutcome>;
  cloudReachable: () => boolean;
  scheduleNext: (run: () => Promise<void>, delayMs: number) => () => void;
  checkpoint: () => void;
  onFailure: (error: unknown) => void;
}

export interface SnapshotCycleSchedule {
  start(): void;
  workerExited(): void;
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
    workerExited() {
      workerInFlight = false;
      try {
        deps.checkpoint();
      } catch (error) {
        deps.onFailure(error);
      }
    },
  };
}
