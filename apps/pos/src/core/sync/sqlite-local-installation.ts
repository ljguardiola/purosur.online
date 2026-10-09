import { isSalesStopReason, type SalesStopReason, type SalesStopState } from "@purosur/domain";
import type { LocalInstallation } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";

export function stopOpeningNewSales(
  database: LocalDatabase,
  reason: SalesStopReason,
  at: Date,
): void {
  database
    .prepare<[string, string]>(
      `UPDATE sync_state SET installation_revoked_at = ?, sales_stopped_reason = ?
       WHERE installation_revoked_at IS NULL`,
    )
    .run(at.toISOString(), reason);
}

export function salesStopOf(database: LocalDatabase): SalesStopState {
  const row = database
    .prepare<[], { installation_revoked_at: string | null; sales_stopped_reason: string | null }>(
      "SELECT installation_revoked_at, sales_stopped_reason FROM sync_state",
    )
    .get();
  if (row?.installation_revoked_at == null) {
    return { stopped: false };
  }
  return {
    stopped: true,
    reason: isSalesStopReason(row.sales_stopped_reason) ? row.sales_stopped_reason : undefined,
  };
}

export class SqliteLocalInstallation implements LocalInstallation {
  private readonly database: LocalDatabase;
  private readonly now: () => Date;

  constructor(database: LocalDatabase, now: () => Date) {
    this.database = database;
    this.now = now;
  }

  async recordRevoked(): Promise<void> {
    stopOpeningNewSales(this.database, "installation_revoked", this.now());
  }
}
