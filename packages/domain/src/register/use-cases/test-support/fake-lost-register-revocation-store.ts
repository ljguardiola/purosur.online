import type { VersionedKey } from "../../model/installation-key.js";
import type {
  HeldRegisterKeys,
  InstallationRevocationAlert,
  RevokedInstallation,
} from "../installation-revocation-ports.js";
import type {
  LostRegisterRevocation,
  LostRegisterRevocationStore,
  LostRegisterRevocationStoreTransaction,
} from "../lost-register-revocation-ports.js";

export interface FakeLostRegisterInstallation extends RevokedInstallation {
  registerId: string;
  revokedAt: Date | null;
}

interface FakeKey extends VersionedKey {
  registerId: string;
}

interface FakeLostRegisterState {
  installations: FakeLostRegisterInstallation[];
  snapshotKeys: FakeKey[];
  contingencyTicketKeys: FakeKey[];
  branchesWithPinResetRequired: { branchId: string; actorId: string }[];
  alerts: InstallationRevocationAlert[];
  revocations: LostRegisterRevocation[];
}

type WriteOperation =
  | "revokeActiveInstallation"
  | "recordSnapshotKey"
  | "recordContingencyTicketKey"
  | "requirePinResetOfBranchUsers"
  | "openRevocationAlert"
  | "recordLostRegisterRevocation";

class FakeLostRegisterRevocationTransaction implements LostRegisterRevocationStoreTransaction {
  private readonly state: FakeLostRegisterState;
  private readonly store: FakeLostRegisterRevocationStore;

  constructor(state: FakeLostRegisterState, store: FakeLostRegisterRevocationStore) {
    this.state = state;
    this.store = store;
  }

  async lockBranchRegister(branchId: string, registerId: string): Promise<boolean> {
    this.store.operationOrder.push("lockBranchRegister");
    return this.store.registerBranches.get(registerId) === branchId;
  }

  async revokeActiveInstallation(
    registerId: string,
    revokedAt: Date,
  ): Promise<RevokedInstallation | null> {
    this.beforeWrite("revokeActiveInstallation");
    const installation = this.state.installations.find(
      (row) => row.registerId === registerId && row.revokedAt === null,
    );
    if (!installation) {
      return null;
    }
    installation.revokedAt = new Date(revokedAt);
    const { deviceId, hostname, windowsVersion } = installation;
    return { deviceId, hostname, windowsVersion };
  }

  async lockRegisterKeys(registerId: string): Promise<HeldRegisterKeys> {
    this.store.operationOrder.push("lockRegisterKeys");
    const ofRegister = (keys: FakeKey[]): VersionedKey[] =>
      keys
        .filter((key) => key.registerId === registerId)
        .map(({ version, key }) => ({ version, key }));
    return {
      snapshotKeys: ofRegister(this.state.snapshotKeys),
      contingencyTicketKeys: ofRegister(this.state.contingencyTicketKeys),
    };
  }

  async recordSnapshotKey(registerId: string, key: VersionedKey): Promise<void> {
    this.beforeWrite("recordSnapshotKey");
    this.state.snapshotKeys.push({ registerId, ...key });
  }

  async recordContingencyTicketKey(registerId: string, key: VersionedKey): Promise<void> {
    this.beforeWrite("recordContingencyTicketKey");
    this.state.contingencyTicketKeys.push({ registerId, ...key });
  }

  async requirePinResetOfBranchUsers(branchId: string, actorId: string): Promise<void> {
    this.beforeWrite("requirePinResetOfBranchUsers");
    this.state.branchesWithPinResetRequired.push({ branchId, actorId });
  }

  async openRevocationAlert(alert: InstallationRevocationAlert): Promise<void> {
    this.beforeWrite("openRevocationAlert");
    this.state.alerts.push(structuredClone(alert));
  }

  async recordLostRegisterRevocation(revocation: LostRegisterRevocation): Promise<void> {
    this.beforeWrite("recordLostRegisterRevocation");
    this.state.revocations.push(structuredClone(revocation));
  }

  private beforeWrite(operation: WriteOperation): void {
    this.store.operationOrder.push(operation);
    if (this.store.failingWrites.has(operation)) {
      throw new Error(`${operation} failed`);
    }
  }
}

export class FakeLostRegisterRevocationStore implements LostRegisterRevocationStore {
  private state: FakeLostRegisterState = {
    installations: [],
    snapshotKeys: [],
    contingencyTicketKeys: [],
    branchesWithPinResetRequired: [],
    alerts: [],
    revocations: [],
  };

  readonly registerBranches = new Map<string, string>();
  readonly failingWrites = new Set<WriteOperation>();
  operationOrder: string[] = [];

  seedRegister(registerId: string, branchId: string): void {
    this.registerBranches.set(registerId, branchId);
  }

  seedInstallation(installation: FakeLostRegisterInstallation): void {
    this.state.installations.push(structuredClone(installation));
  }

  seedSnapshotKey(registerId: string, key: VersionedKey): void {
    this.state.snapshotKeys.push({ registerId, ...key });
  }

  seedContingencyTicketKey(registerId: string, key: VersionedKey): void {
    this.state.contingencyTicketKeys.push({ registerId, ...key });
  }

  snapshot(): FakeLostRegisterState {
    return structuredClone(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: LostRegisterRevocationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = structuredClone(this.state);
    try {
      return await work(new FakeLostRegisterRevocationTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
