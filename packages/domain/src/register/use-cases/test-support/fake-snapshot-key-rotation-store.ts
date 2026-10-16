import type { VersionedKey } from "../../model/installation-key.js";
import type { RegisterStoreTransaction } from "../register-store.js";
import type {
  SnapshotKeyRotation,
  SnapshotKeyRotationStore,
  SnapshotKeyRotationStoreTransaction,
} from "../snapshot-key-rotation-ports.js";
import type { FakeRegisterStore } from "./fake-register-store.js";

class FakeSnapshotKeyRotationTransaction implements SnapshotKeyRotationStoreTransaction {
  private readonly store: FakeSnapshotKeyRotationStore;
  private readonly registerTransaction: RegisterStoreTransaction;

  constructor(store: FakeSnapshotKeyRotationStore, registerTransaction: RegisterStoreTransaction) {
    this.store = store;
    this.registerTransaction = registerTransaction;
  }

  async lockRegisterSnapshotKeys(registerId: string): Promise<VersionedKey[] | undefined> {
    this.store.operationOrder.push("lockRegisterSnapshotKeys");
    if (!this.store.registerIds.has(registerId)) {
      return undefined;
    }
    return (await this.registerTransaction.lockRegisterKeys(registerId)).snapshotKeys;
  }

  async recordSnapshotKey(registerId: string, key: VersionedKey): Promise<void> {
    this.store.operationOrder.push("recordSnapshotKey");
    await this.registerTransaction.recordSnapshotKey(registerId, key);
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
  private readonly registerStore: FakeRegisterStore;
  readonly registerIds = new Set<string>();
  rotations: SnapshotKeyRotation[] = [];
  failingAudit = false;
  operationOrder: string[] = [];

  constructor(registerStore: FakeRegisterStore) {
    this.registerStore = registerStore;
  }

  seedRegister(registerId: string): void {
    this.registerIds.add(registerId);
  }

  async transaction<TOutcome>(
    work: (tx: SnapshotKeyRotationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const rotationsBefore = [...this.rotations];
    try {
      return await this.registerStore.transaction((registerTransaction) =>
        work(new FakeSnapshotKeyRotationTransaction(this, registerTransaction)),
      );
    } catch (error) {
      this.rotations = rotationsBefore;
      throw error;
    }
  }
}
