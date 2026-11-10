import type { FiscalEmissionMode, OutboxEventDraft } from "@purosur/domain";
import type {
  ContingencyLedger,
  ContingencyLedgerTransaction,
  OpenContingencyInterval,
  PredecessorOpenContingencyInterval,
} from "@purosur/domain/register/use-cases";
import { readEmittingInContingencyTime } from "../fiscal/contingency-time-read";
import type { LocalDatabase } from "../platform/local-database";
import { appendOutboxEvent } from "../sync/sqlite-outbox";
import { readOpenSession, readRegisterIdentity } from "./sqlite-cash-ledger";

interface OpenIntervalRow {
  interval_id: string;
  started_at: string;
  last_seen_at: string;
}

interface PredecessorOpenIntervalRow extends OpenIntervalRow {
  session_closed_at: string | null;
}

export class SqliteContingencyLedger implements ContingencyLedger {
  private readonly database: LocalDatabase;
  private readonly outboxChainKey: string | undefined;
  private readonly readMode: () => FiscalEmissionMode;

  constructor(
    database: LocalDatabase,
    outboxChainKey: string | undefined,
    readMode: () => FiscalEmissionMode,
  ) {
    this.database = database;
    this.outboxChainKey = outboxChainKey;
    this.readMode = readMode;
  }

  transaction<TOutcome>(work: (tx: ContingencyLedgerTransaction) => TOutcome): TOutcome {
    return this.database.transaction(() => work(this.transactionScope()))();
  }

  private transactionScope(): ContingencyLedgerTransaction {
    const { database, readMode } = this;
    return {
      registerId: () => readRegisterIdentity(database)?.registerId,
      cashSessionOpen: () => readOpenSession(database) !== undefined,
      emittingInContingencyTime: () => readEmittingInContingencyTime(readMode),
      replenishmentPending: () =>
        database.prepare("SELECT 1 FROM register_predecessor").get() !== undefined,
      openInterval: () => readOpenInterval(database),
      predecessorOpenIntervals: () =>
        database
          .prepare<[], PredecessorOpenIntervalRow>(
            `SELECT interval_id, started_at, last_seen_at, session_closed_at
             FROM contingency_intervals WHERE ended_at IS NULL AND predecessor = 1
             ORDER BY started_at, interval_id`,
          )
          .all()
          .map(predecessorOpenIntervalOf),
      reportingStartedAt: () => {
        const row = database
          .prepare<[], { since: string }>("SELECT since FROM contingency_reporting_start")
          .get();
        return row === undefined ? undefined : new Date(row.since);
      },
      seenUnenrolled: () =>
        database.prepare("SELECT 1 FROM register_seen_unenrolled").get() !== undefined,
      recordOpenedInterval: ({ id, startedAt }) => {
        database
          .prepare(
            `INSERT INTO contingency_intervals (interval_id, started_at, ended_at, last_seen_at)
             VALUES (?, ?, NULL, ?)`,
          )
          .run(id, startedAt.toISOString(), startedAt.toISOString());
      },
      recordIntervalSeen: (intervalId, seenAt) => {
        database
          .prepare("UPDATE contingency_intervals SET last_seen_at = ? WHERE interval_id = ?")
          .run(seenAt.toISOString(), intervalId);
      },
      recordClosedInterval: (intervalId, endedAt) => {
        database
          .prepare("UPDATE contingency_intervals SET ended_at = ? WHERE interval_id = ?")
          .run(endedAt.toISOString(), intervalId);
      },
      recordReportingStarted: (since) => {
        database
          .prepare("INSERT INTO contingency_reporting_start (id, since) VALUES (1, ?)")
          .run(since.toISOString());
      },
      recordSeenUnenrolled: () => {
        database.prepare("INSERT INTO register_seen_unenrolled (id) VALUES (1)").run();
      },
      appendOutboxEvent: (draft) => this.appendOutboxEvent(draft),
    };
  }

  private appendOutboxEvent(draft: OutboxEventDraft): void {
    if (this.outboxChainKey === undefined) {
      throw new Error("the ledger has no outbox chain key");
    }
    appendOutboxEvent(this.database, this.outboxChainKey, draft);
  }
}

function readOpenInterval(database: LocalDatabase): OpenContingencyInterval | undefined {
  const row = database
    .prepare<[], OpenIntervalRow>(
      `SELECT interval_id, started_at, last_seen_at
       FROM contingency_intervals WHERE ended_at IS NULL AND predecessor = 0`,
    )
    .get();
  return row === undefined ? undefined : openIntervalOf(row);
}

function openIntervalOf(row: OpenIntervalRow): OpenContingencyInterval {
  return {
    id: row.interval_id,
    startedAt: new Date(row.started_at),
    lastSeenAt: new Date(row.last_seen_at),
  };
}

function predecessorOpenIntervalOf(
  row: PredecessorOpenIntervalRow,
): PredecessorOpenContingencyInterval {
  return {
    ...openIntervalOf(row),
    sessionClosedAt: row.session_closed_at === null ? null : new Date(row.session_closed_at),
  };
}
