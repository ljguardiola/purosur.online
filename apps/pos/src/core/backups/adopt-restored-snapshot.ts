import { existsSync } from "node:fs";
import { rename, rm } from "node:fs/promises";
import { join } from "node:path";
import { resetRestoredSyncIdentity } from "@purosur/domain/sync/use-cases";
import {
  applyMigrations,
  type LocalMigration,
  openLocalDatabaseFile,
} from "../platform/local-database";
import { type Durability, nodeDurability } from "../register/durable-files";
import { SqliteRestoredSyncIdentityStore } from "../sync/sqlite-restored-sync-identity-store";
import type { RestorePending } from "./restore-pending";

const LIVE_DATABASE_FILE = "register.sqlite";
export const STAGED_DATABASE_FILE = "register.restored.sqlite";

export type AdoptStagedSnapshotOutcome =
  | { kind: "nothing_staged" }
  | { kind: "discarded" }
  | { kind: "adopted" };

export async function adoptStagedSnapshot({
  folder,
  pending,
  migrations,
  now,
  durability = nodeDurability,
}: {
  folder: string;
  pending: RestorePending;
  migrations: readonly LocalMigration[];
  now: () => Date;
  durability?: Durability;
}): Promise<AdoptStagedSnapshotOutcome> {
  const stagedPath = join(folder, STAGED_DATABASE_FILE);
  if (!existsSync(stagedPath)) {
    return { kind: "nothing_staged" };
  }
  const deviceId = pending.deviceId();
  if (deviceId === undefined) {
    await rm(stagedPath, { force: true });
    return { kind: "discarded" };
  }

  const staged = openLocalDatabaseFile(stagedPath);
  try {
    applyMigrations(staged, migrations, now);
    await resetRestoredSyncIdentity(
      { store: new SqliteRestoredSyncIdentityStore(staged) },
      { deviceId },
    );
    staged.pragma("wal_checkpoint(TRUNCATE)");
  } finally {
    staged.close();
  }

  const livePath = join(folder, LIVE_DATABASE_FILE);
  await rm(`${livePath}-wal`, { force: true });
  await rm(`${livePath}-shm`, { force: true });
  await rename(stagedPath, livePath);
  await durability.folder(folder);
  pending.clear();
  return { kind: "adopted" };
}
