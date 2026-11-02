import type { SyncedFact } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";

type ContingencyFact = Extract<
  SyncedFact,
  { kind: "contingency_entered" | "contingency_left" | "contingency_reporting_started" }
>;

export function applyReplenishedContingencyFact(
  database: LocalDatabase,
  fact: ContingencyFact,
): void {
  switch (fact.kind) {
    case "contingency_entered":
      database
        .prepare(
          `INSERT OR IGNORE INTO contingency_intervals (interval_id, started_at, ended_at, last_seen_at)
           VALUES (?, ?, NULL, ?)`,
        )
        .run(
          fact.interval.intervalId,
          fact.interval.startedAt.toISOString(),
          fact.interval.startedAt.toISOString(),
        );
      return;
    case "contingency_left":
      database
        .prepare(
          `INSERT INTO contingency_intervals (interval_id, started_at, ended_at, last_seen_at)
           VALUES (?, ?, ?, ?)
           ON CONFLICT (interval_id) DO UPDATE SET ended_at = excluded.ended_at`,
        )
        .run(
          fact.interval.intervalId,
          fact.interval.startedAt.toISOString(),
          fact.interval.endedAt.toISOString(),
          fact.interval.endedAt.toISOString(),
        );
      return;
    case "contingency_reporting_started":
      database
        .prepare("INSERT OR IGNORE INTO contingency_reporting_start (id, since) VALUES (1, ?)")
        .run(fact.reporting.since.toISOString());
      return;
  }
}
