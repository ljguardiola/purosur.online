import type { Clock } from "../../shared/index.js";
import type {
  InstallationRevocationTransaction,
  KeyVersionChange,
} from "./installation-revocation-ports.js";
import type { InstallationKeyGenerator } from "./register-store.js";

export interface EveryInstallationRevocationRecord {
  registerId: string;
  deviceId: string;
  revokedAt: Date;
  actorId: string;
  snapshotKeyVersion: KeyVersionChange;
  contingencyTicketKeyVersion: KeyVersionChange;
}

export interface EveryInstallationRevocationStoreTransaction
  extends InstallationRevocationTransaction {
  lockEveryRegister(): Promise<string[]>;
  recordEveryInstallationRevocation(revocation: EveryInstallationRevocationRecord): Promise<void>;
}

export interface EveryInstallationRevocationStore {
  transaction<TOutcome>(
    work: (tx: EveryInstallationRevocationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface RevokeEveryInstallationPorts {
  store: EveryInstallationRevocationStore;
  clock: Clock;
  keys: InstallationKeyGenerator;
}
