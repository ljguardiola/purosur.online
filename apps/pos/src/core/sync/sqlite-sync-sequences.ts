import type { SyncSequencesReader } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";

export function sqliteSyncSequences(database: LocalDatabase): SyncSequencesReader {
  return {
    current: async () => {
      const row = database
        .prepare<[], { last_device_seq: number; pull_cursor: number }>(
          "SELECT last_device_seq, pull_cursor FROM sync_state",
        )
        .get();
      return { lastDeviceSeq: row?.last_device_seq ?? 0, pullCursor: row?.pull_cursor ?? 0 };
    },
  };
}
