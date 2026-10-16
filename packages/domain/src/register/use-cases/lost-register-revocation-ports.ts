import type { Clock } from "../../shared/index.js";
import type { VersionedKey } from "../model/installation-key.js";
import type { InstallationKeyGenerator } from "./register-store.js";

export interface RevokedInstallation {
  deviceId: string;
  hostname: string;
  windowsVersion: string;
}

export interface LostRegisterKeys {
  snapshotKeys: VersionedKey[];
  contingencyTicketKeys: VersionedKey[];
}

export interface LostRegisterRevocationAlert extends RevokedInstallation {
  registerId: string;
}

export interface KeyVersionChange {
  previous: number | null;
  current: number;
}

export interface LostRegisterRevocation {
  registerId: string;
  deviceId: string;
  revokedAt: Date;
  actorId: string;
  snapshotKeyVersion: KeyVersionChange;
  contingencyTicketKeyVersion: KeyVersionChange;
}

export interface LostRegisterRevocationStoreTransaction {
  lockBranchRegister(branchId: string, registerId: string): Promise<boolean>;
  revokeActiveInstallation(
    registerId: string,
    revokedAt: Date,
  ): Promise<RevokedInstallation | null>;
  lockRegisterKeys(registerId: string): Promise<LostRegisterKeys>;
  recordSnapshotKey(registerId: string, key: VersionedKey): Promise<void>;
  recordContingencyTicketKey(registerId: string, key: VersionedKey): Promise<void>;
  requirePinResetOfBranchUsers(branchId: string, actorId: string): Promise<void>;
  openRevocationAlert(alert: LostRegisterRevocationAlert): Promise<void>;
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
