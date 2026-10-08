import type { RegisterHealthCheck, RegisterHealthChecks } from "@purosur/domain/fiscal/use-cases";
import type { LocalDatabase } from "../platform/local-database";

export class SqliteRegisterHealthChecks implements RegisterHealthChecks {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  async recordHealthCheck(check: RegisterHealthCheck, keepLast: number): Promise<void> {
    this.database.transaction(() => {
      this.database
        .prepare(
          `INSERT INTO register_health_checks (checked_at, round_trip_ms, token_valid, arca_reachable)
           VALUES (@checked_at, @round_trip_ms, @token_valid, @arca_reachable)`,
        )
        .run({
          checked_at: check.checkedAt.toISOString(),
          round_trip_ms: check.roundTripMs,
          token_valid: check.tokenValid ? 1 : 0,
          arca_reachable: check.arcaReachable ? 1 : 0,
        });
      this.database
        .prepare(
          `DELETE FROM register_health_checks
           WHERE id NOT IN (SELECT id FROM register_health_checks ORDER BY id DESC LIMIT ?)`,
        )
        .run(keepLast);
    })();
  }
}
