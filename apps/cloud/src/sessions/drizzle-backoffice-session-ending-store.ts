import type {
  BackofficeSessionEndingStore,
  BackofficeSessionEndingStoreTransaction,
  EndedSession,
  UnrevokedSession,
} from "@purosur/domain/sessions/use-cases";
import { inArray, isNull } from "drizzle-orm";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { auditLog, sessions } from "../platform/db/schema.js";

type Transaction<TQueryResult extends PgQueryResultHKT> = Parameters<
  Parameters<PgDatabase<TQueryResult>["transaction"]>[0]
>[0];

export class DrizzleBackofficeSessionEndingStoreTransaction<TQueryResult extends PgQueryResultHKT>
  implements BackofficeSessionEndingStoreTransaction
{
  private readonly tx: Transaction<TQueryResult>;

  constructor(tx: Transaction<TQueryResult>) {
    this.tx = tx;
  }

  lockUnrevokedSessions(): Promise<UnrevokedSession[]> {
    return this.tx
      .select({
        id: sessions.id,
        userId: sessions.userId,
        createdAt: sessions.createdAt,
        lastSeenAt: sessions.lastSeenAt,
      })
      .from(sessions)
      .where(isNull(sessions.revokedAt))
      .for("update");
  }

  async endSessions(sessionIds: string[], at: Date): Promise<void> {
    await this.tx.update(sessions).set({ revokedAt: at }).where(inArray(sessions.id, sessionIds));
  }

  async recordSessionEnded(actorId: string, session: EndedSession, at: Date): Promise<void> {
    await this.tx.insert(auditLog).values({
      entity: "session",
      entityId: session.id,
      actorId,
      previousValue: { user_id: session.userId },
      newValue: { revoked_at: at.toISOString() },
      at,
    });
  }
}

export class DrizzleBackofficeSessionEndingStore<TQueryResult extends PgQueryResultHKT>
  implements BackofficeSessionEndingStore
{
  private readonly db: PgDatabase<TQueryResult>;

  constructor(db: PgDatabase<TQueryResult>) {
    this.db = db;
  }

  transaction<TOutcome>(
    work: (tx: BackofficeSessionEndingStoreTransaction) => Promise<TOutcome>,
  ): Promise<TOutcome> {
    return this.db.transaction((tx) =>
      work(new DrizzleBackofficeSessionEndingStoreTransaction(tx)),
    );
  }
}
