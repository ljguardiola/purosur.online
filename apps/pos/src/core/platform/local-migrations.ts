import type { LocalMigration } from "./local-database";

const migrationFiles = import.meta.glob<string>("../migrations/*.sql", {
  query: "?raw",
  import: "default",
  eager: true,
});

export const LOCAL_MIGRATIONS: readonly LocalMigration[] = Object.entries(migrationFiles)
  .map(([path, sql]) => ({
    name: path.replace(/^.*\//, "").replace(/\.sql$/, ""),
    sql,
  }))
  .sort((a, b) => a.name.localeCompare(b.name));
