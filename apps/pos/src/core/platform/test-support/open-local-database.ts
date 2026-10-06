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
  const database = openLocalDatabaseFile(path);
  try {
    applyMigrations(database, migrations, now);
    return database;
  } catch (error) {
    database.close();
    throw error;
  }
}
