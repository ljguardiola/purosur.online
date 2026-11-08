import type { LocalDatabase } from "../platform/local-database";

export function installationHeld(database: LocalDatabase): boolean {
  return (
    database
      .prepare<[], { held: 1 }>("SELECT 1 AS held FROM sync_state WHERE device_id IS NOT NULL")
      .get() !== undefined
  );
}

export function heldDeviceId(database: LocalDatabase): string | undefined {
  return (
    database.prepare<[], { device_id: string | null }>("SELECT device_id FROM sync_state").get()
      ?.device_id ?? undefined
  );
}

export function staleSequenceDetected(database: LocalDatabase): boolean {
  return (
    database
      .prepare<[], { detected: 1 }>(
        "SELECT 1 AS detected FROM sync_state WHERE stale_sequence_detected_at IS NOT NULL",
      )
      .get() !== undefined
  );
}
