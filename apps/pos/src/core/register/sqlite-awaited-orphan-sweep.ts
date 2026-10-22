import type { AwaitedOrphanSweep } from "@purosur/domain/register/use-cases";
import type { LocalDatabase } from "../platform/local-database";

export class SqliteAwaitedOrphanSweep implements AwaitedOrphanSweep {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  async clear(): Promise<void> {
    this.database.exec("DELETE FROM awaiting_orphan_sweep");
  }
}
