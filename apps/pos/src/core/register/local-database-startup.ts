import { dirname, join } from "node:path";
import {
  checkLocalDatabase,
  type LocalDatabaseHealth,
  reportLocalDatabaseDamage,
} from "@purosur/domain/register/use-cases";
import { isDatabaseDamage } from "../platform/database-damage";
import {
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
  | { kind: "out_of_service" };

const OUT_OF_SERVICE: StartedLocalDatabase = { kind: "out_of_service" };

export async function startLocalDatabase(deps: {
  path: string;
  migrations: readonly LocalMigration[];
  now: () => Date;
}): Promise<StartedLocalDatabase> {
  const markerPath = join(dirname(deps.path), DAMAGE_MARKER_FILE);
  let database: LocalDatabase;
  try {
    database = openLocalDatabaseFile(deps.path);
  } catch (error) {
    if (!isDatabaseDamage(error)) {
      throw error;
    }
    await reportLocalDatabaseDamage({
      health: localDatabaseHealth({ markerPath, now: deps.now, integrityHolds: () => false }),
    });
    return OUT_OF_SERVICE;
  }

  const health = localDatabaseHealth({
    markerPath,
    now: deps.now,
    integrityHolds: () => sqliteIntegrityHolds(database),
  });
  try {
    if ((await checkLocalDatabase({ health })).kind === "out_of_service") {
      database.close();
      return OUT_OF_SERVICE;
    }
    applyMigrations(database, deps.migrations, deps.now);
    return { kind: "ready", database, health };
  } catch (error) {
    database.close();
    if (!isDatabaseDamage(error)) {
      throw error;
    }
    await reportLocalDatabaseDamage({ health });
    return OUT_OF_SERVICE;
  }
}
