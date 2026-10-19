import type {
  CompromiseResponseStore,
  CompromiseResponseStoreTransaction,
  CompromiseResponses,
  StoredCompromiseResponse,
} from "@purosur/domain/sessions/use-cases";
import { asc, desc, eq, sql } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import {
  auditLog,
  compromiseResponseCompletions,
  compromiseResponses,
} from "../platform/db/schema.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

type Reader<TQueryResult extends PgQueryResultHKT> =
  | PgDatabase<TQueryResult>
  | Transaction<TQueryResult>;

const RESPONSES_LOCK_KEY = "compromise_responses";

async function latestResponse<TQueryResult extends PgQueryResultHKT>(
  reader: Reader<TQueryResult>,
): Promise<StoredCompromiseResponse | null> {
  const [latest] = await reader
    .select()
    .from(compromiseResponses)
    .orderBy(desc(compromiseResponses.startedAt), desc(compromiseResponses.id))
    .limit(1);
  if (latest === undefined) {
    return null;
  }
  const completions = await reader
    .select({ key: compromiseResponseCompletions.key, at: compromiseResponseCompletions.doneAt })
    .from(compromiseResponseCompletions)
    .where(eq(compromiseResponseCompletions.responseId, latest.id))
    .orderBy(asc(compromiseResponseCompletions.doneAt), asc(compromiseResponseCompletions.key));
  return {
    id: latest.id,
    startedAt: latest.startedAt,
    startedBy: latest.startedBy,
    completions: completions as StoredCompromiseResponse["completions"],
  };
}

class DrizzleCompromiseResponseStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements CompromiseResponseStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;

  constructor(tx: Transaction<TQueryResult>) {
    this.tx = tx;
  }

  async lockLatestResponse(): Promise<StoredCompromiseResponse | null> {
    await this.tx.execute(
      sql`select pg_advisory_xact_lock(hashtextextended(${RESPONSES_LOCK_KEY}, 0))`,
    );
    return latestResponse(this.tx);
  }

  async startResponse(actorId: string, at: Date): Promise<StoredCompromiseResponse> {
    const [started] = await this.tx
      .insert(compromiseResponses)
      .values({ startedAt: at, startedBy: actorId })
      .returning({ id: compromiseResponses.id });
    if (started === undefined) {
      throw new Error("the started runbook returned no row");
    }
    await this.tx.insert(auditLog).values({
      entity: "compromise_response",
      entityId: started.id,
      actorId,
      newValue: { started_at: at.toISOString() },
      at,
    });
    return { id: started.id, startedAt: at, startedBy: actorId, completions: [] };
  }

  async recordStepDone(
    responseId: string,
    step: Parameters<CompromiseResponseStoreTransaction["recordStepDone"]>[1],
    actorId: string,
    at: Date,
  ): Promise<void> {
    await this.tx
      .insert(compromiseResponseCompletions)
      .values({ responseId, key: step, doneBy: actorId, doneAt: at });
    await this.tx.insert(auditLog).values({
      entity: "compromise_response",
      entityId: responseId,
      actorId,
      newValue: { step, done_at: at.toISOString() },
      at,
    });
  }

  async recordItemDone(
    responseId: string,
    item: Parameters<CompromiseResponseStoreTransaction["recordItemDone"]>[1],
    actorId: string,
    at: Date,
  ): Promise<void> {
    await this.tx
      .insert(compromiseResponseCompletions)
      .values({ responseId, key: item, doneBy: actorId, doneAt: at });
    await this.tx.insert(auditLog).values({
      entity: "compromise_response",
      entityId: responseId,
      actorId,
      newValue: { item, done_at: at.toISOString() },
      at,
    });
  }
}

export class DrizzleCompromiseResponseStore<TQueryResult extends PgQueryResultHKT>
  implements CompromiseResponseStore, CompromiseResponses
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  findLatestResponse(): Promise<StoredCompromiseResponse | null> {
    return latestResponse(this.db);
  }

  transaction<TOutcome>(
    work: (tx: CompromiseResponseStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) => work(new DrizzleCompromiseResponseStoreTransaction(tx)));
  }
}
