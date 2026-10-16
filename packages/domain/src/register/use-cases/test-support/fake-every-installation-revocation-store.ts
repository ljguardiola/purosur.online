import type { VersionedKey } from "../../model/installation-key.js";
import type {
  EveryInstallationRevocationRecord,
  EveryInstallationRevocationStore,
  EveryInstallationRevocationStoreTransaction,
} from "../every-installation-revocation-ports.js";
import type {
  HeldRegisterKeys,
  InstallationRevocationAlert,
  RevokedInstallation,
} from "../installation-revocation-ports.js";

export interface FakeEveryInstallation extends RevokedInstallation {
  registerId: string;
  revokedAt: Date | null;
}

interface FakeKey extends VersionedKey {
  registerId: string;
}

interface FakeEveryInstallationState {
  registerIds: string[];
  installations: FakeEveryInstallation[];
  snapshotKeys: FakeKey[];
  contingencyTicketKeys: FakeKey[];
  alerts: InstallationRevocationAlert[];
  revocations: EveryInstallationRevocationRecord[];
}

type WriteOperation =
  | "revokeActiveInstallation"
  | "recordSnapshotKey"
  | "recordContingencyTicketKey"
  | "openRevocationAlert"
  | "recordEveryInstallationRevocation";

class FakeEveryInstallationRevocationTransaction
  implements EveryInstallationRevocationStoreTransaction
{
  private readonly state: FakeEveryInstallationState;
  private readonly store: FakeEveryInstallationRevocationStore;

  constructor(state: FakeEveryInstallationState, store: FakeEveryInstallationRevocationStore) {
    this.state = state;
    this.store = store;
  }

  async lockEveryRegister(): Promise<string[]> {
    this.store.operationOrder.push("lockEveryRegister");
    return [...this.state.registerIds].sort();
  }

  async revokeActiveInstallation(
    registerId: string,
    revokedAt: Date,
  ): Promise<RevokedInstallation | null> {
    this.beforeWrite("revokeActiveInstallation", registerId);
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
    this.store.operationOrder.push(`lockRegisterKeys:${registerId}`);
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
    this.beforeWrite("recordSnapshotKey", registerId);
    this.state.snapshotKeys.push({ registerId, ...key });
  }

  async recordContingencyTicketKey(registerId: string, key: VersionedKey): Promise<void> {
    this.beforeWrite("recordContingencyTicketKey", registerId);
    this.state.contingencyTicketKeys.push({ registerId, ...key });
  }

  async openRevocationAlert(alert: InstallationRevocationAlert): Promise<void> {
    this.beforeWrite("openRevocationAlert", alert.registerId);
    this.state.alerts.push(structuredClone(alert));
  }

  async recordEveryInstallationRevocation(
    revocation: EveryInstallationRevocationRecord,
  ): Promise<void> {
    this.beforeWrite("recordEveryInstallationRevocation", revocation.registerId);
    this.state.revocations.push(structuredClone(revocation));
  }

  private beforeWrite(operation: WriteOperation, registerId: string): void {
    this.store.operationOrder.push(`${operation}:${registerId}`);
    if (this.store.failingWrites.has(`${operation}:${registerId}`)) {
      throw new Error(`${operation} failed for ${registerId}`);
    }
  }
}

export class FakeEveryInstallationRevocationStore implements EveryInstallationRevocationStore {
  private state: FakeEveryInstallationState = {
    registerIds: [],
    installations: [],
    snapshotKeys: [],
    contingencyTicketKeys: [],
    alerts: [],
    revocations: [],
  };

  readonly failingWrites = new Set<`${WriteOperation}:${string}`>();
  operationOrder: string[] = [];

  seedRegister(registerId: string): void {
    this.state.registerIds.push(registerId);
  }

  seedInstallation(installation: FakeEveryInstallation): void {
    this.state.installations.push(structuredClone(installation));
  }

  seedSnapshotKey(registerId: string, key: VersionedKey): void {
    this.state.snapshotKeys.push({ registerId, ...key });
  }

  seedContingencyTicketKey(registerId: string, key: VersionedKey): void {
    this.state.contingencyTicketKeys.push({ registerId, ...key });
  }

  snapshot(): FakeEveryInstallationState {
    return structuredClone(this.state);
  }

  async transaction<TOutcome>(
    work: (tx: EveryInstallationRevocationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    const before = structuredClone(this.state);
    try {
      return await work(new FakeEveryInstallationRevocationTransaction(this.state, this));
    } catch (error) {
      this.state = before;
      throw error;
    }
  }
}
