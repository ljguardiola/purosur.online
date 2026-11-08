export interface LocalDatabaseMigrations {
  appliedMigrationNames(): Promise<readonly string[]>;
  knownMigrationNames(): readonly string[];
}
