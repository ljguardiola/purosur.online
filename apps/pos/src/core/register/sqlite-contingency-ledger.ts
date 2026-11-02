import type { OutboxEventDraft } from "@purosur/domain";
import type {
  ContingencyLedger,
  ContingencyLedgerTransaction,
  OpenContingencyInterval,
} from "@purosur/domain/register/use-cases";
import type { LocalDatabase } from "../platform/local-database";
import { appendOutboxEvent } from "../sync/sqlite-outbox";
import { readOpenSession, readRegisterIdentity } from "./sqlite-cash-ledger";

interface OpenIntervalRow {
  interval_id: string;
  started_at: string;
  last_seen_at: string;
}

export class SqliteContingencyLedger implements ContingencyLedger {
  private readonly database: LocalDatabase;
  private readonly outboxChainKey: string | undefined;

  constructor(database: LocalDatabase, outboxChainKey: string | undefined) {
    this.database = database;
    this.outboxChainKey = outboxChainKey;
  }

  transaction<TOutcome>(work: (tx: ContingencyLedgerTransaction) => TOutcome): TOutcome {
    return this.database.transaction(() => work(this.transactionScope()))();
  }

  private transactionScope(): ContingencyLedgerTransaction {
    const { database } = this;
    return {
      registerId: () => readRegisterIdentity(database)?.registerId,
      cashSessionOpen: () => readOpenSession(database) !== undefined,
      openInterval: () => readOpenInterval(database),
      reportingStartedAt: () => {
        const row = database
          .prepare<[], { since: string }>("SELECT since FROM contingency_reporting_start")
          .get();
        return row === undefined ? undefined : new Date(row.since);
      },
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
       FROM contingency_intervals WHERE ended_at IS NULL`,
    )
    .get();
  return row === undefined
    ? undefined
    : {
        id: row.interval_id,
        startedAt: new Date(row.started_at),
        lastSeenAt: new Date(row.last_seen_at),
      };
}
