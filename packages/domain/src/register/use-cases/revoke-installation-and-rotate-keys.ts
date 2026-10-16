import { latestKey, nextKeyVersion } from "../model/installation-key.js";
import type {
  InstallationRevocationTransaction,
  KeyVersionChange,
  RevokedInstallation,
} from "./installation-revocation-ports.js";
import type { InstallationKeyGenerator } from "./register-store.js";

export interface InstallationRevocationWithRotatedKeys {
  installation: RevokedInstallation;
  snapshotKeyVersion: KeyVersionChange;
  contingencyTicketKeyVersion: KeyVersionChange;
}

export async function revokeInstallationAndRotateKeys(
  tx: InstallationRevocationTransaction,
  keys: InstallationKeyGenerator,
  registerId: string,
  revokedAt: Date,
): Promise<InstallationRevocationWithRotatedKeys | null> {
  const installation = await tx.revokeActiveInstallation(registerId, revokedAt);
  if (installation === null) {
    return null;
  }
  const held = await tx.lockRegisterKeys(registerId);
  const snapshotKeyVersion = {
    previous: latestKey(held.snapshotKeys)?.version ?? null,
    current: nextKeyVersion(held.snapshotKeys),
  };
  const contingencyTicketKeyVersion = {
    previous: latestKey(held.contingencyTicketKeys)?.version ?? null,
    current: nextKeyVersion(held.contingencyTicketKeys),
  };
  await tx.recordSnapshotKey(registerId, {
    version: snapshotKeyVersion.current,
    key: keys.generate(),
  });
  await tx.recordContingencyTicketKey(registerId, {
    version: contingencyTicketKeyVersion.current,
    key: keys.generate(),
  });
  return { installation, snapshotKeyVersion, contingencyTicketKeyVersion };
}
