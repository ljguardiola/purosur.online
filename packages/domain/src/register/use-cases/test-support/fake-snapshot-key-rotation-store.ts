import type { VersionedKey } from "../../../shared/index.js";
import type {
  SnapshotKeyRotation,
  SnapshotKeyRotationStore,
  SnapshotKeyRotationStoreTransaction,
} from "../snapshot-key-rotation-ports.js";

export interface FakeSnapshotKey extends VersionedKey {
  registerId: string;
}

class FakeSnapshotKeyRotationTransaction implements SnapshotKeyRotationStoreTransaction {
  private readonly store: FakeSnapshotKeyRotationStore;

  constructor(store: FakeSnapshotKeyRotationStore) {
    this.store = store;
  }

  async lockRegisterSnapshotKeys(registerId: string): Promise<VersionedKey[] | undefined> {
    this.store.operationOrder.push("lockRegisterSnapshotKeys");
    if (!this.store.registerIds.has(registerId)) {
      return undefined;
    }
    return this.store.snapshotKeys
      .filter((key) => key.registerId === registerId)
      .map(({ version, key }) => ({ version, key }));
  }

  async recordSnapshotKey(registerId: string, key: VersionedKey): Promise<void> {
    this.store.operationOrder.push("recordSnapshotKey");
    this.store.snapshotKeys.push({ registerId, ...key });
  }

  async recordSnapshotKeyRotation(rotation: SnapshotKeyRotation): Promise<void> {
    this.store.operationOrder.push("recordSnapshotKeyRotation");
    if (this.store.failingAudit) {
      throw new Error("recordSnapshotKeyRotation failed");
    }
    this.store.rotations.push({ ...rotation });
  }
}

export class FakeSnapshotKeyRotationStore implements SnapshotKeyRotationStore {
  readonly registerIds = new Set<string>();
  snapshotKeys: FakeSnapshotKey[] = [];
  rotations: SnapshotKeyRotation[] = [];
  failingAudit = false;
  operationOrder: string[] = [];

  seedRegister(registerId: string): void {
    this.registerIds.add(registerId);
  }

  seedSnapshotKey(key: FakeSnapshotKey): void {
    this.snapshotKeys.push({ ...key });
  }

  async transaction<TOutcome>(
    work: (tx: SnapshotKeyRotationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const keysBefore = [...this.snapshotKeys];
    const rotationsBefore = [...this.rotations];
    try {
      return await work(new FakeSnapshotKeyRotationTransaction(this));
    } catch (error) {
      this.snapshotKeys = keysBefore;
      this.rotations = rotationsBefore;
      throw error;
    }
  }
}
