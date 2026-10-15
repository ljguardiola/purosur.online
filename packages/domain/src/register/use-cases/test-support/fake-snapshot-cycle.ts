import type { BatteryReading } from "../../model/battery.js";
import type { SnapshotCycleFacts, SnapshotSequences } from "../../model/snapshot-cycle.js";
import type { IdGenerator } from "../cash-ledger.js";
import type {
  SnapshotCycleState,
  SnapshotWorkerJob,
  SnapshotWorkerLauncher,
} from "../snapshot-cycle-ports.js";

const GIGABYTE = 1024 * 1024 * 1024;

export class FakeSnapshotCycleState implements SnapshotCycleState {
  last: SnapshotSequences | undefined = { lastDeviceSeq: 10, pullCursor: 20 };
  current: SnapshotSequences = { lastDeviceSeq: 11, pullCursor: 20 };
  batteryReading: BatteryReading = { kind: "absent" };
  storageReading: SnapshotCycleFacts["storage"] = {
    diskFreeBytes: 100 * GIGABYTE,
    diskFreeRatio: 0.5,
    walSizeBytes: 0,
  };
  pending = false;
  reachable = true;

  async lastGeneration(): Promise<SnapshotSequences | undefined> {
    return this.last;
  }

  async currentSequences(): Promise<SnapshotSequences> {
    return this.current;
  }

  async hasPendingUploads(): Promise<boolean> {
    return this.pending;
  }

  async battery(): Promise<BatteryReading> {
    return this.batteryReading;
  }

  async storage(): Promise<SnapshotCycleFacts["storage"]> {
    return this.storageReading;
  }

  async cloudReachable(): Promise<boolean> {
    return this.reachable;
  }
}

export class RecordingSnapshotWorkerLauncher implements SnapshotWorkerLauncher {
  launched: SnapshotWorkerJob[] = [];
  available = true;

  async launch(job: SnapshotWorkerJob): Promise<boolean> {
    if (!this.available) {
      return false;
    }
    this.launched.push(job);
    return true;
  }
}

export class SequentialIds implements IdGenerator {
  issued = 0;

  next(): string {
    this.issued += 1;
    return `generation-${this.issued}`;
  }
}
