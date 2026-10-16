import type { Clock } from "../../shared/index.js";
import type {
  InstallationRevocationTransaction,
  KeyVersionChange,
} from "./installation-revocation-ports.js";
import type { InstallationKeyGenerator } from "./register-store.js";

export interface LostRegisterRevocation {
  registerId: string;
  deviceId: string;
  revokedAt: Date;
  actorId: string;
  snapshotKeyVersion: KeyVersionChange;
  contingencyTicketKeyVersion: KeyVersionChange;
}

export interface LostRegisterRevocationStoreTransaction extends InstallationRevocationTransaction {
  lockBranchRegister(branchId: string, registerId: string): Promise<boolean>;
  requirePinResetOfBranchUsers(branchId: string, actorId: string): Promise<void>;
  recordLostRegisterRevocation(revocation: LostRegisterRevocation): Promise<void>;
}

export interface LostRegisterRevocationStore {
  transaction<TOutcome>(
    work: (tx: LostRegisterRevocationStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome>;
}

export interface RevokeLostRegisterPorts {
  store: LostRegisterRevocationStore;
  clock: Clock;
  keys: InstallationKeyGenerator;
}
