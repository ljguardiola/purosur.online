import type { LocalDatabase } from "../platform/local-database";

export function installationHeld(database: LocalDatabase): boolean {
  return (
    database
      .prepare<[], { held: 1 }>("SELECT 1 AS held FROM sync_state WHERE device_id IS NOT NULL")
      .get() !== undefined
  );
}
