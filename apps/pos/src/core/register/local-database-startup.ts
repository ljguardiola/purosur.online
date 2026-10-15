import { dirname } from "node:path";
import {
  checkLocalDatabase,
  type LocalDatabaseHealth,
  type LocalDatabaseMigrations,
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
import { localDatabaseHealth, sqliteIntegrityHolds } from "./sqlite-local-database-health";

export type StartedLocalDatabase =
  | { kind: "ready"; database: LocalDatabase; health: LocalDatabaseHealth }
  | { kind: "out_of_service" }
  | { kind: "newer_than_version" };

const OUT_OF_SERVICE: StartedLocalDatabase = { kind: "out_of_service" };

function migrationsOfFile(deps: {
  path: string;
  migrations: readonly LocalMigration[];
}): LocalDatabaseMigrations {
  return {
    appliedMigrationNames: async () => {
      try {
        return appliedMigrationNames(deps.path);
      } catch {
        // Opening the file for writing meets the same failure and the damage marker still decides first.
        return [];
      }
    },
    knownMigrationNames: () => deps.migrations.map((migration) => migration.name),
  };
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
    folder: dirname(deps.path),
    now: deps.now,
    integrityHolds: () => sqliteIntegrityHolds(open()),
  });
  try {
    const check = await checkLocalDatabase({ health, migrations: migrationsOfFile(deps) });
    if (check.kind === "newer_than_version") {
      return { kind: "newer_than_version" };
    }
    if (check.kind === "out_of_service") {
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
