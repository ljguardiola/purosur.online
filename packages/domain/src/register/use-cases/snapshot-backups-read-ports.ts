import type { Clock } from "../../shared/index.js";
import type { SnapshotLifecycleRules } from "../model/snapshot-lifecycle-rules.js";
import type { SnapshotGeneration } from "./snapshot-generations.js";

export interface SnapshotBackupRegister {
  id: string;
  name: string;
}

export interface SnapshotBackupsReader {
  registersForBackups(): Promise<SnapshotBackupRegister[]>;
  registerExists(registerId: string): Promise<boolean>;
  lifecycleRules(): Promise<SnapshotLifecycleRules | undefined>;
  generationsOf(registerId: string): Promise<SnapshotGeneration[]>;
}

export interface RegisterSnapshotBackupsPorts {
  reader: SnapshotBackupsReader;
  clock: Clock;
}

export interface ListSnapshotBackupRegistersPorts {
  reader: SnapshotBackupsReader;
}
