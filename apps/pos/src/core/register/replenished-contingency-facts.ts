import type { ReplenishedEventSource, SyncedFact } from "@purosur/domain/sync/use-cases";
import type { LocalDatabase } from "../platform/local-database";

type ContingencyFact = Extract<
  SyncedFact,
  { kind: "contingency_entered" | "contingency_left" | "contingency_reporting_started" }
>;

export function applyReplenishedContingencyFact(
  database: LocalDatabase,
  fact: ContingencyFact,
  { deviceId }: ReplenishedEventSource,
): void {
  switch (fact.kind) {
    case "contingency_entered":
      database
        .prepare(
          `INSERT OR IGNORE INTO contingency_intervals (interval_id, started_at, ended_at, last_seen_at, predecessor, device_id)
           VALUES (?, ?, NULL, ?, 1, ?)`,
        )
        .run(
          fact.interval.intervalId,
          fact.interval.startedAt.toISOString(),
          fact.interval.startedAt.toISOString(),
          deviceId,
        );
      return;
    case "contingency_left":
      database
        .prepare(
          `INSERT INTO contingency_intervals (interval_id, started_at, ended_at, last_seen_at, predecessor)
           VALUES (?, ?, ?, ?, 1)
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

export function recordReplenishedRunningEvidence(
  database: LocalDatabase,
  fact: SyncedFact,
  { deviceId, occurredAt }: ReplenishedEventSource,
): void {
  database
    .prepare(
      `UPDATE contingency_intervals SET last_seen_at = MAX(last_seen_at, ?)
       WHERE predecessor = 1 AND ended_at IS NULL AND device_id = ?`,
    )
    .run(occurredAt.toISOString(), deviceId);
  if (fact.kind === "cash_session_closed") {
    const closedAt = fact.session.closedAt.toISOString();
    database
      .prepare(
        `UPDATE contingency_intervals SET session_closed_at = MIN(COALESCE(session_closed_at, @closedAt), @closedAt)
         WHERE predecessor = 1 AND ended_at IS NULL AND device_id = @deviceId AND started_at <= @closedAt`,
      )
      .run({ closedAt, deviceId });
  }
}
