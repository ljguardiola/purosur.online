import type { RoundTripSamples } from "@purosur/domain/fiscal/use-cases";
import type { LocalDatabase } from "../platform/local-database";

export class SqliteRoundTripSamples implements RoundTripSamples {
  private readonly database: LocalDatabase;

  constructor(database: LocalDatabase) {
    this.database = database;
  }

  async recent(): Promise<readonly number[]> {
    return this.database
      .prepare<[], { round_trip_ms: number }>(
        "SELECT round_trip_ms FROM register_health_checks ORDER BY id",
      )
      .all()
      .map((row) => row.round_trip_ms);
  }
}
