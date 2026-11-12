import {
  applyMigrations,
  type LocalDatabase,
  type LocalMigration,
  openLocalDatabaseFile,
} from "../local-database";

export function openLocalDatabase(
  path: string,
  migrations: readonly LocalMigration[],
  now: () => Date,
): LocalDatabase {
  return migrated(openLocalDatabaseFile(path), migrations, now);
}

export function openLocalDatabaseWithoutDiskSync(
  path: string,
  migrations: readonly LocalMigration[],
  now: () => Date,
): LocalDatabase {
  const database = openLocalDatabaseFile(path);
  try {
    database.pragma("synchronous = OFF");
  } catch (error) {
    database.close();
    throw error;
  }
  return migrated(database, migrations, now);
}

function migrated(
  database: LocalDatabase,
  migrations: readonly LocalMigration[],
  now: () => Date,
): LocalDatabase {
  try {
    applyMigrations(database, migrations, now);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
