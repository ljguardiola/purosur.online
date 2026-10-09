import type { AcceptedPushLog } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";

export class SqliteAcceptedPushLog implements AcceptedPushLog {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  async recordAcceptedPush(at: Date): Promise<void> {
    this.database
      .prepare<[string]>("UPDATE sync_state SET last_accepted_push_at = ? WHERE id = 1")
      .run(at.toISOString());
  }

  lastAcceptedPushAt(): Date | null {
    const row = this.database
      .prepare<[], { last_accepted_push_at: string | null }>(
        "SELECT last_accepted_push_at FROM sync_state WHERE id = 1",
      )
      .get();
    return row?.last_accepted_push_at == null ? null : new Date(row.last_accepted_push_at);
  }
}
