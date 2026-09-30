import { FIRST_KEY_VERSION, inVersionOrder, latestKey } from "../model/installation-key.js";
import type {
  InstallationKeyGenerator,
  RegisterStoreTransaction,
  VersionedKey,
} from "./register-store.js";

export interface InstallationKeys {
  snapshotKeyVersions: VersionedKey[];
  contingencyTicketKey: VersionedKey;
  outboxChainKey: string;
}

type RegisterKeysHandedOver = Omit<InstallationKeys, "outboxChainKey">;

async function firstKey(
  keys: InstallationKeyGenerator,
  record: (key: VersionedKey) => Promise<void>,
): Promise<VersionedKey> {
  const key = { version: FIRST_KEY_VERSION, key: keys.generate() };
  await record(key);
  return key;
}

// A register gets its keys the first time one of its installations is handed them.
export async function registerKeysHandedOver(
  tx: RegisterStoreTransaction,
  keys: InstallationKeyGenerator,
  registerId: string,
): Promise<RegisterKeysHandedOver> {
  const held = await tx.lockRegisterKeys(registerId);
  const snapshotKeyVersions =
    held.snapshotKeys.length > 0
      ? inVersionOrder(held.snapshotKeys)
      : [await firstKey(keys, (key) => tx.recordSnapshotKey(registerId, key))];
  const contingencyTicketKey =
    latestKey(held.contingencyTicketKeys) ??
    (await firstKey(keys, (key) => tx.recordContingencyTicketKey(registerId, key)));
  return { snapshotKeyVersions, contingencyTicketKey };
}
