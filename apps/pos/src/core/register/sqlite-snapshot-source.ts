import type { SnapshotSequences } from "@purosur/domain";
import type { LocalDatabase } from "../platform/local-database";

export function readSyncSequences(database: LocalDatabase): SnapshotSequences {
  const row = database
    .prepare<[], { last_device_seq: number; pull_cursor: number }>(
      "SELECT last_device_seq, pull_cursor FROM sync_state",
    )
    .get();
  return { lastDeviceSeq: row?.last_device_seq ?? 0, pullCursor: row?.pull_cursor ?? 0 };
}

export function readOwnRegisterId(database: LocalDatabase): string | undefined {
  return database.prepare<[], { id: string }>("SELECT id FROM own_register WHERE removed = 0").get()
    ?.id;
}
