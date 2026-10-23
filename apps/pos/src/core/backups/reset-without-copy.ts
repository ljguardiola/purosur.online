import type { DeviceCredentials, RestoreFirstInstallation } from "@purosur/contracts";
import { resetSyncIdentityWithoutCopy } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { SqliteNoCopySyncIdentityStore } from "../sync/sqlite-no-copy-sync-identity-store";

export interface ResetWithoutCopyDeps {
  database: LocalDatabase | undefined;
  readCredentials: () => Promise<DeviceCredentials | undefined>;
}

export async function resetWithoutCopy(
  { database, readCredentials }: ResetWithoutCopyDeps,
  firstInstallation: RestoreFirstInstallation,
): Promise<void> {
  const credentials = await readCredentials();
  if (credentials === undefined || database === undefined) {
    throw new Error("the register cannot record its first installation yet");
  }
  await resetSyncIdentityWithoutCopy(
    { store: new SqliteNoCopySyncIdentityStore(database) },
    {
      deviceId: credentials.device_id,
      registerId: firstInstallation.register_id,
      firstInstallationId: firstInstallation.installation_id,
    },
  );
}
