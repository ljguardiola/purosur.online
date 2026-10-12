import { dirname, join } from "node:path";
import { localDatabaseVersionOf } from "@purosur/domain";
import {
  checkLocalDatabase,
  type LocalDatabaseHealth,
  reportLocalDatabaseDamage,
} from "@purosur/domain/register/use-cases";
import { isDatabaseDamage } from "../platform/database-damage";
import {
  appliedMigrationNames,
  applyMigrations,
  type LocalDatabase,
  type LocalMigration,
  openLocalDatabaseFile,
} from "../platform/local-database";
import {
  DAMAGE_MARKER_FILE,
  localDatabaseHealth,
  sqliteIntegrityHolds,
} from "./sqlite-local-database-health";

export type StartedLocalDatabase =
  | { kind: "ready"; database: LocalDatabase; health: LocalDatabaseHealth }
  | { kind: "out_of_service" }
  | { kind: "newer_than_version" };

const OUT_OF_SERVICE: StartedLocalDatabase = { kind: "out_of_service" };

function versionOfFile(deps: {
  path: string;
  migrations: readonly LocalMigration[];
}): LocalDatabaseVersion {
  try {
    return localDatabaseVersionOf({
      applied: appliedMigrationNames(deps.path),
      known: deps.migrations.map((migration) => migration.name),
    });
  } catch (error) {
    if (isDatabaseDamage(error)) {
      throw error;
    }
    // Opening the file for writing meets the same failure and the damage marker still decides first.
    return "known";
  }
}

export async function startLocalDatabase(deps: {
  path: string;
  migrations: readonly LocalMigration[];
  now: () => Date;
}): Promise<StartedLocalDatabase> {
  let opened: LocalDatabase | undefined;
  function open(): LocalDatabase {
    opened ??= openLocalDatabaseFile(deps.path);
    return opened;
  }
  const health = localDatabaseHealth({
    markerPath: join(dirname(deps.path), DAMAGE_MARKER_FILE),
    now: deps.now,
    integrityHolds: () => sqliteIntegrityHolds(open()),
  });
  try {
    if (versionOfFile(deps) === "newer_than_version") {
      return { kind: "newer_than_version" };
    }
    if ((await checkLocalDatabase({ health })).kind === "out_of_service") {
      opened?.close();
      return OUT_OF_SERVICE;
    }
    const database = open();
    applyMigrations(database, deps.migrations, deps.now);
    return { kind: "ready", database, health };
  } catch (error) {
    opened?.close();
    if (!isDatabaseDamage(error)) {
      throw error;
    }
    await reportLocalDatabaseDamage({ health });
    return OUT_OF_SERVICE;
  }
}
