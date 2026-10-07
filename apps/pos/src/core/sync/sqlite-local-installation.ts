import type { LocalInstallation } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";

export function stopOpeningNewSales(database: LocalDatabase, at: Date): void {
  database
    .prepare(
      "UPDATE sync_state SET installation_revoked_at = ? WHERE installation_revoked_at IS NULL",
    )
    .run(at.toISOString());
}

export class SqliteLocalInstallation implements LocalInstallation {
  private readonly database: LocalDatabase;
  private readonly now: () => Date;

  constructor(database: LocalDatabase, now: () => Date) {
    this.database = database;
    this.now = now;
  }

  async recordRevoked(): Promise<void> {
    stopOpeningNewSales(this.database, this.now());
  }
}
