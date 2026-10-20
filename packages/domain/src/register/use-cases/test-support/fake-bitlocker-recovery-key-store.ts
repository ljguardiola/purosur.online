import type {
  BitlockerRecoveryKeyConsultation,
  BitlockerRecoveryKeyLoad,
  BitlockerRecoveryKeyStore,
  BitlockerRecoveryKeyStoreTransaction,
  HeldBitlockerRecoveryKey,
  NewBitlockerRecoveryKey,
} from "../bitlocker-recovery-key-ports.js";

export interface FakeBitlockerInstallation {
  registerId: string;
  installationId: string;
  revokedAt: Date | null;
}

interface FakeStoredKey extends NewBitlockerRecoveryKey {}

interface FakeBitlockerState {
  installations: FakeBitlockerInstallation[];
  keys: FakeStoredKey[];
  loads: BitlockerRecoveryKeyLoad[];
  consultations: BitlockerRecoveryKeyConsultation[];
}

type WriteOperation = "storeRecoveryKey" | "recordRecoveryKeyLoaded" | "recordRecoveryKeyConsulted";

class FakeBitlockerRecoveryKeyTransaction implements BitlockerRecoveryKeyStoreTransaction {
  private readonly state: FakeBitlockerState;
  private readonly store: FakeBitlockerRecoveryKeyStore;

  constructor(state: FakeBitlockerState, store: FakeBitlockerRecoveryKeyStore) {
    this.state = state;
    this.store = store;
  }

  async lockBranchRegister(branchId: string, registerId: string): Promise<boolean> {
    this.store.operationOrder.push("lockBranchRegister");
    return this.store.registerBranches.get(registerId) === branchId;
  }

  async currentInstallationOf(registerId: string): Promise<string | null> {
    this.store.operationOrder.push("currentInstallationOf");
    const current = this.state.installations.find(
      (row) => row.registerId === registerId && row.revokedAt === null,
    );
    return current?.installationId ?? null;
  }

  async hasRecoveryKey(installationId: string): Promise<boolean> {
    this.store.operationOrder.push("hasRecoveryKey");
    return this.state.keys.some((key) => key.installationId === installationId);
  }

  async storeRecoveryKey(key: NewBitlockerRecoveryKey): Promise<void> {
    this.beforeWrite("storeRecoveryKey");
    this.state.keys.push(structuredClone(key));
  }

  async recoveryKeyOf(installationId: string): Promise<HeldBitlockerRecoveryKey | null> {
    this.store.operationOrder.push("recoveryKeyOf");
    const held = this.state.keys.find((key) => key.installationId === installationId);
    return held ? { recoveryKey: held.recoveryKey, keyIdentifier: held.keyIdentifier } : null;
  }

  async recordRecoveryKeyLoaded(load: BitlockerRecoveryKeyLoad): Promise<void> {
    this.beforeWrite("recordRecoveryKeyLoaded");
    this.state.loads.push(structuredClone(load));
  }

  async recordRecoveryKeyConsulted(consultation: BitlockerRecoveryKeyConsultation): Promise<void> {
    this.beforeWrite("recordRecoveryKeyConsulted");
    this.state.consultations.push(structuredClone(consultation));
  }

  private beforeWrite(operation: WriteOperation): void {
    this.store.operationOrder.push(operation);
    if (this.store.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }
}

export class FakeBitlockerRecoveryKeyStore implements BitlockerRecoveryKeyStore {
  private state: FakeBitlockerState = {
    installations: [],
    keys: [],
    loads: [],
    consultations: [],
  };

  readonly registerBranches = new Map<string, string>();
  readonly failingWrites = new Set<WriteOperation>();
  operationOrder: string[] = [];

  seedRegister(registerId: string, branchId: string): void {
    this.registerBranches.set(registerId, branchId);
  }

  seedInstallation(installation: FakeBitlockerInstallation): void {
    this.state.installations.push(structuredClone(installation));
  }

  seedRecoveryKey(key: NewBitlockerRecoveryKey): void {
    this.state.keys.push(structuredClone(key));
  }

  snapshot(): FakeBitlockerState {
    return structuredClone(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: BitlockerRecoveryKeyStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = structuredClone(this.state);
    try {
      return await work(new FakeBitlockerRecoveryKeyTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
