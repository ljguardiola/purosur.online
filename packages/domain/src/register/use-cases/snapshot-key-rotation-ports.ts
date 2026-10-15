import type { VersionedKey } from "../model/installation-key.js";
import type { InstallationKeyGenerator } from "./register-store.js";

export interface SnapshotKeyRotation {
  registerId: string;
  previousVersion: number;
  newVersion: number;
  actorId: string;
}

export interface SnapshotKeyRotationStoreTransaction {
  lockRegisterSnapshotKeys(registerId: string): Promise<VersionedKey[] | undefined>;
  recordSnapshotKey(registerId: string, key: VersionedKey): Promise<void>;
  recordSnapshotKeyRotation(rotation: SnapshotKeyRotation): Promise<void>;
}

export interface SnapshotKeyRotationStore {
  transaction<TOutcome>(
    work: (tx: SnapshotKeyRotationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface RotateRegisterSnapshotKeyPorts {
  store: SnapshotKeyRotationStore;
  keys: InstallationKeyGenerator;
}
