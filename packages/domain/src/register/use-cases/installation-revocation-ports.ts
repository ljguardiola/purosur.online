import type { VersionedKey } from "../model/installation-key.js";

export interface RevokedInstallation {
  deviceId: string;
  hostname: string;
  windowsVersion: string;
}

export interface HeldRegisterKeys {
  snapshotKeys: VersionedKey[];
  contingencyTicketKeys: VersionedKey[];
}

export interface InstallationRevocationAlert extends RevokedInstallation {
  registerId: string;
}

export interface KeyVersionChange {
  previous: number | null;
  current: number;
}

export interface InstallationRevocationTransaction {
  revokeActiveInstallation(
    registerId: string,
    revokedAt: Date,
  ): Promise<RevokedInstallation | null>;
  lockRegisterKeys(registerId: string): Promise<HeldRegisterKeys>;
  recordSnapshotKey(registerId: string, key: VersionedKey): Promise<void>;
  recordContingencyTicketKey(registerId: string, key: VersionedKey): Promise<void>;
  openRevocationAlert(alert: InstallationRevocationAlert): Promise<void>;
}
